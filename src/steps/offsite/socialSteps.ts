import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import type { WordPressService } from '../../services/wordpressService.js';
import type { MakeService } from '../../services/makeService.js';
import { SocialPostChain } from '../../chains/offsite/socialPostChain.js';
import type { WPPost, PipelineConfig, ProcessingResult } from '../../types/wordpress.js';
import type { SocialPostBatch } from '../../types/social.js';

/**
 * Memory structure for social media pipeline
 */
export interface SocialPipelineMemory {
  ollama: OllamaService;
  wp: WordPressService;
  make: MakeService;
  config: PipelineConfig;
  businessName: string;
  recentPosts?: WPPost[];
  batches?: SocialPostBatch[];
  results: ProcessingResult[];
}

/**
 * Step: Fetch recently published WordPress content
 */
export const fetchPublishedContentStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as SocialPipelineMemory;

  console.log('  → Fetching recently published posts...');
  const posts = await memory.wp.getAllPosts();

  // Filter to published posts with content
  memory.recentPosts = posts.filter(p =>
    p.status === 'publish' && memory.wp.hasContent(p)
  );

  console.log(`  ✓ Found ${memory.recentPosts.length} published posts with content`);
  return ctx;
};

/**
 * Step: Generate social media posts for each published post
 */
export const generateSocialPostsStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as SocialPipelineMemory;
  const posts = memory.recentPosts || [];

  if (posts.length === 0) {
    console.log('  ⊘ No posts to generate social content for');
    return ctx;
  }

  const chain = new SocialPostChain(memory.ollama);
  const batches: SocialPostBatch[] = [];

  for (let i = 0; i < Math.min(posts.length, memory.config.batchSize); i++) {
    const post = posts[i];
    const title = post.title.rendered;
    const excerpt = post.excerpt?.rendered?.replace(/<[^>]*>/g, '').trim() || '';

    console.log(`  📱 [${i + 1}/${Math.min(posts.length, memory.config.batchSize)}] Generating social posts for: "${title}"`);

    if (memory.config.dryRun) {
      console.log('    ⊘ [DRY RUN] Would generate social posts');
      continue;
    }

    try {
      const batch = await chain.generate(
        title,
        excerpt,
        post.link,
        memory.businessName
      );
      batch.sourcePostId = post.id;
      batches.push(batch);
      console.log(`    ✓ Generated ${batch.posts.length} social posts`);
    } catch (error) {
      console.error(`    ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      memory.results.push({
        itemId: post.id,
        itemTitle: title,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Rate limiting
    if (i < posts.length - 1) {
      await new Promise(r => setTimeout(r, memory.config.delayBetweenRequests));
    }
  }

  memory.batches = batches;
  return ctx;
};

/**
 * Step: Push generated social posts to Buffer via Make webhook
 */
export const pushToBufferStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as SocialPipelineMemory;
  const batches = memory.batches || [];

  if (batches.length === 0) {
    console.log('  ⊘ No social posts to push');
    return ctx;
  }

  if (memory.config.dryRun) {
    console.log('  ⊘ [DRY RUN] Would push social posts to Buffer:');
    batches.forEach(batch => {
      batch.posts.forEach(post => {
        console.log(`    - [${post.platform}] ${post.text.substring(0, 80)}...`);
      });
    });
    return ctx;
  }

  for (const batch of batches) {
    console.log(`  → Pushing ${batch.posts.length} posts for "${batch.sourcePostTitle}"...`);
    const publishResults = await memory.make.publishBatch(batch.posts);

    const succeeded = publishResults.filter(r => r.success).length;
    const failed = publishResults.filter(r => !r.success);

    memory.results.push({
      itemId: batch.sourcePostId,
      itemTitle: batch.sourcePostTitle,
      success: failed.length === 0,
      error: failed.length > 0 ? `${failed.length} platform(s) failed` : undefined,
    });

    console.log(`  ✓ Pushed ${succeeded}/${publishResults.length} posts`);
    if (failed.length > 0) {
      failed.forEach(f => console.error(`    ✗ ${f.platform}: ${f.error}`));
    }
  }

  return ctx;
};
