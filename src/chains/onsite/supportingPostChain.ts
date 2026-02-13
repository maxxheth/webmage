import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { SupportingPlanItem, GeneratedSupportingPost } from '../../types/seo.js';

const SupportingPostSchema = z.object({
  title: z.string(),
  content: z.string(),
  excerpt: z.string(),
  slimSeoMeta: z.object({
    title: z.string(),
    description: z.string(),
  }),
  pillarLinkAnchor: z.string(),
  tags: z.array(z.string()),
  faqSchema: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

const SYSTEM_PROMPT = `You are an expert SEO content writer. Write focused, in-depth supporting blog posts that complement a pillar page by covering specific subtopics. Each post should naturally link back to the pillar page and establish topical depth.`;

/**
 * Supporting Post Generation Chain
 *
 * Generates supporting blog posts (800-1500 words) that link back to their
 * pillar post, with proper Slim SEO meta and FAQ schema.
 */
export class SupportingPostChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async generate(
    plan: SupportingPlanItem,
    pillarTitle: string,
    pillarUrl: string,
    businessNiche: string,
    location: string,
  ): Promise<GeneratedSupportingPost> {
    const prompt = `Write a supporting blog post for a ${businessNiche} business in ${location}.

## Post Details
- Title: ${plan.title}
- Target Keyword: ${plan.targetKeyword}
- Target Word Count: ${plan.estimatedWordCount} words

## Pillar Post Context
This post supports the pillar post: "${pillarTitle}"
Pillar URL: ${pillarUrl}
This post MUST include a natural, contextual link back to the pillar post.

## Requirements

### Content (HTML)
- Write ${plan.estimatedWordCount} words of focused, in-depth content
- Use proper HTML tags: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>
- Include the target keyword naturally in the first paragraph
- Include a contextual link to the pillar post using: <a href="${pillarUrl}">[anchor text]</a>
- Use local keywords (${location}) where natural
- Focus on a specific subtopic — don't try to cover everything
- Include actionable tips, examples, or case studies
- DO NOT use <h1> — WordPress handles that via the title

### SEO Meta
- slimSeoMeta.title: 50-60 chars, include primary keyword
- slimSeoMeta.description: 150-160 chars, compelling with CTA
- excerpt: 1-2 sentence summary

### Pillar Link
- pillarLinkAnchor: The anchor text used to link to the pillar post

### FAQ Schema
- Generate 3-4 FAQs related to this specific subtopic
- Answers should be concise (2-3 sentences)

### Tags
- Suggest 3-5 relevant tags`;

    return this.ollama.generateStructured(prompt, SupportingPostSchema, SYSTEM_PROMPT);
  }
}
