import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { SocialPost, SocialPostBatch } from '../../types/social.js';

const SocialPostSchema = z.object({
  platform: z.enum(['twitter', 'facebook', 'linkedin', 'instagram']),
  text: z.string(),
  hashtags: z.array(z.string()),
});

const SocialBatchSchema = z.object({
  posts: z.array(SocialPostSchema),
});

const SYSTEM_PROMPT = `You are a social media marketing expert. Create engaging, platform-specific social media posts that drive traffic to blog content. Each platform has different conventions:
- Twitter/X: Concise (280 chars max), punchy, 2-3 hashtags
- Facebook: Conversational, can be longer, include a question or CTA
- LinkedIn: Professional, value-driven, industry insight angle
- Instagram: Visual-first caption, storytelling, 5-10 hashtags`;

/**
 * Social Post Generation Chain
 *
 * Takes a published blog post → generates platform-specific social media posts
 * optimized for Twitter/X, Facebook, LinkedIn, and Instagram.
 */
export class SocialPostChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async generate(
    postTitle: string,
    postExcerpt: string,
    postUrl: string,
    businessName: string,
    platforms: SocialPost['platform'][] = ['twitter', 'facebook', 'linkedin', 'instagram']
  ): Promise<SocialPostBatch> {
    const prompt = `Create social media posts to promote this blog post.

## Blog Post
- Title: "${postTitle}"
- Excerpt: "${postExcerpt}"
- URL: ${postUrl}
- Business: ${businessName}

## Required Platforms
${platforms.map(p => `- ${p}`).join('\n')}

## Requirements
For each platform, generate:
- text: The post copy (DO NOT include the URL in the text — it will be attached separately)
- hashtags: Relevant hashtags WITHOUT the # symbol (e.g., "SEO" not "#SEO")

Platform-specific guidelines:
- twitter: Max 250 chars (leaving room for URL), punchy hook, 2-3 hashtags
- facebook: 1-3 sentences, ask an engaging question, 2-3 hashtags
- linkedin: Professional insight angle, mention a key takeaway, 3-5 hashtags
- instagram: Storytelling caption, emoji use encouraged, 8-12 hashtags`;

    const result = await this.ollama.generateStructured(prompt, SocialBatchSchema, SYSTEM_PROMPT);

    return {
      sourcePostId: 0,
      sourcePostTitle: postTitle,
      sourcePostUrl: postUrl,
      posts: result.posts.map(p => ({
        ...p,
        url: postUrl,
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}
