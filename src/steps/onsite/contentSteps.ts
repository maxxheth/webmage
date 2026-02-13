import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import type { WordPressService } from '../../services/wordpressService.js';
import { PillarPostChain } from '../../chains/onsite/pillarPostChain.js';
import { SupportingPostChain } from '../../chains/onsite/supportingPostChain.js';
import { ImagePromptChain } from '../../chains/onsite/imagePromptChain.js';
import { GeminiImageService } from '../../services/geminiImageService.js';
import { withRetry } from '../../utils/retry.js';
import type { SiloPlan, GeneratedPillarPost, GeneratedSupportingPost } from '../../types/seo.js';
import type { PipelineConfig, ProcessingResult } from '../../types/wordpress.js';

/**
 * Memory structure for the content generation pipeline
 */
export interface ContentPipelineMemory {
  ollama: OllamaService;
  wp: WordPressService;
  config: PipelineConfig;
  silo: SiloPlan;
  businessNiche: string;
  location: string;
  results: ProcessingResult[];
  pillarPost?: GeneratedPillarPost;
  pillarPostId?: number;
  pillarPostUrl?: string;
  supportingPosts?: GeneratedSupportingPost[];
  supportingPostIds?: number[];
}

/**
 * Step: Generate the pillar post content
 */
export const generatePillarStep: Step<SiloPlan> = async (ctx) => {
  const memory = ctx.memory as ContentPipelineMemory;
  const { silo, config } = memory;

  console.log(`\n  📄 Generating pillar post: "${silo.pillar.title}"`);

  if (config.dryRun) {
    console.log('  ⊘ [DRY RUN] Would generate pillar post content');
    return ctx;
  }

  const chain = new PillarPostChain(memory.ollama);
  memory.pillarPost = await withRetry(
    () => chain.generate(
      silo.pillar,
      silo.name,
      memory.businessNiche,
      memory.location,
      silo.supportingPosts.map(sp => sp.title)
    ),
    config.maxRetries,
    config.retryDelay,
    'Pillar post generation'
  );

  console.log(`  ✓ Pillar post generated: ${memory.pillarPost.content.length} chars`);
  return ctx;
};

/**
 * Step: Generate all supporting posts for the silo
 */
export const generateSupportingPostsStep: Step<SiloPlan> = async (ctx) => {
  const memory = ctx.memory as ContentPipelineMemory;
  const { silo, config } = memory;

  if (config.dryRun || !memory.pillarPost) {
    console.log(`  ⊘ [DRY RUN] Would generate ${silo.supportingPosts.length} supporting posts`);
    return ctx;
  }

  const pillarUrl = memory.pillarPostUrl || `/${silo.pillar.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
  const chain = new SupportingPostChain(memory.ollama);
  const posts: GeneratedSupportingPost[] = [];

  for (let i = 0; i < silo.supportingPosts.length; i++) {
    const plan = silo.supportingPosts[i];
    console.log(`  📝 [${i + 1}/${silo.supportingPosts.length}] Generating: "${plan.title}"`);

    const post = await withRetry(
      () => chain.generate(
        plan,
        silo.pillar.title,
        pillarUrl,
        memory.businessNiche,
        memory.location
      ),
      config.maxRetries,
      config.retryDelay,
      `Supporting post "${plan.title}"`
    );

    posts.push(post);
    console.log(`  ✓ Generated: ${post.content.length} chars`);

    // Rate limiting
    if (i < silo.supportingPosts.length - 1) {
      await new Promise(r => setTimeout(r, config.delayBetweenRequests));
    }
  }

  memory.supportingPosts = posts;
  return ctx;
};

/**
 * Step: Resolve internal link placeholders in the pillar post.
 * Replaces [LINK:Post Title] with actual URLs after supporting posts are published.
 */
export const resolveInternalLinksStep: Step<SiloPlan> = async (ctx) => {
  const memory = ctx.memory as ContentPipelineMemory;

  if (memory.config.dryRun || !memory.pillarPost || !memory.supportingPostIds) {
    console.log('  ⊘ [DRY RUN] Would resolve internal link placeholders');
    return ctx;
  }

  console.log('  → Resolving internal link placeholders...');

  let content = memory.pillarPost.content;
  const supportingPosts = memory.supportingPosts || [];

  for (let i = 0; i < supportingPosts.length; i++) {
    const post = supportingPosts[i];
    const postId = memory.supportingPostIds[i];

    if (postId) {
      try {
        const wpPost = await memory.wp.getPost(postId);
        const postUrl = wpPost.link;
        const placeholder = `[LINK:${post.title}]`;
        const link = `<a href="${postUrl}">${post.title}</a>`;
        content = content.replace(placeholder, link);
        console.log(`    ✓ Resolved: "${post.title}" → ${postUrl}`);
      } catch {
        console.warn(`    ⚠ Could not resolve link for post ID ${postId}`);
      }
    }
  }

  memory.pillarPost.content = content;
  return ctx;
};

/**
 * Step: Publish all generated content to WordPress
 */
export const publishStep: Step<SiloPlan> = async (ctx) => {
  const memory = ctx.memory as ContentPipelineMemory;
  const { wp, config, silo } = memory;

  if (config.dryRun) {
    console.log('  ⊘ [DRY RUN] Would publish to WordPress:');
    if (memory.pillarPost) {
      console.log(`    - Pillar: "${memory.pillarPost.title}"`);
    }
    if (memory.supportingPosts) {
      memory.supportingPosts.forEach(sp => {
        console.log(`    - Supporting: "${sp.title}"`);
      });
    }
    return ctx;
  }

  // Ensure category exists
  console.log(`  → Creating/finding category: "${silo.categoryName}"`);
  const category = await wp.findOrCreateCategory(silo.categoryName);
  const tagIds = await wp.findOrCreateTags(silo.tags);

  const imageChain = new ImagePromptChain(memory.ollama);

  // Publish supporting posts first (so we can get their URLs for internal links)
  const supportingPostIds: number[] = [];
  if (memory.supportingPosts) {
    for (const post of memory.supportingPosts) {
      console.log(`  → Publishing supporting post: "${post.title}"`);
      const postTagIds = await wp.findOrCreateTags(post.tags);

      const wpPost = await wp.createPost({
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        status: 'publish',
        categories: [category.id],
        tags: [...tagIds, ...postTagIds],
        meta: {
          slim_seo: post.slimSeoMeta,
        },
      });

      supportingPostIds.push(wpPost.id);
      memory.results.push({
        itemId: wpPost.id,
        itemTitle: post.title,
        success: true,
      });
      console.log(`  ✓ Published: ID ${wpPost.id}`);
    }
  }

  memory.supportingPostIds = supportingPostIds;

  // Publish pillar post
  if (memory.pillarPost) {
    // Resolve internal links now that we have supporting post IDs
    await resolveInternalLinksStep(ctx);

    // Generate image prompt/placeholder
    const imagePromptData = await imageChain.generatePrompt(
      memory.pillarPost.title,
      memory.pillarPost.excerpt,
      memory.businessNiche
    );

    // If images are enabled, generate and upload as featured image
    let featuredImageId: number | undefined;
    if (process.env.ENABLE_IMAGES === 'true' && imagePromptData.prompt) {
      try {
        console.log('  🖼️  Generating featured image via Gemini...');
        const gemini = new GeminiImageService();
        const imageBuffer = await gemini.generateImage(imagePromptData.prompt);
        const slug = memory.pillarPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        featuredImageId = await wp.uploadMedia(imageBuffer, `${slug}-featured.png`);
        console.log(`  ✓ Featured image uploaded: ID ${featuredImageId}`);
      } catch (imgError) {
        console.warn(`  ⚠ Image generation failed, continuing without: ${imgError instanceof Error ? imgError.message : String(imgError)}`);
      }
    }

    console.log(`  → Publishing pillar post: "${memory.pillarPost.title}"`);
    const pillarTagIds = await wp.findOrCreateTags(memory.pillarPost.tags);

    const wpPillar = await wp.createPost({
      title: memory.pillarPost.title,
      content: memory.pillarPost.content,
      excerpt: memory.pillarPost.excerpt,
      status: 'publish',
      categories: [category.id],
      tags: [...tagIds, ...pillarTagIds],
      ...(featuredImageId ? { featured_media: featuredImageId } : {}),
      meta: {
        slim_seo: memory.pillarPost.slimSeoMeta,
      },
    });

    memory.pillarPostId = wpPillar.id;
    memory.pillarPostUrl = wpPillar.link;
    memory.results.push({
      itemId: wpPillar.id,
      itemTitle: memory.pillarPost.title,
      success: true,
    });
    console.log(`  ✓ Pillar published: ID ${wpPillar.id}`);
  }

  return ctx;
};
