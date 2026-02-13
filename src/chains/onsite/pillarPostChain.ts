import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { PillarPlanItem, GeneratedPillarPost } from '../../types/seo.js';

const PillarPostSchema = z.object({
  title: z.string(),
  content: z.string(),
  excerpt: z.string(),
  slimSeoMeta: z.object({
    title: z.string(),
    description: z.string(),
  }),
  categoryName: z.string(),
  tags: z.array(z.string()),
  internalLinkPlaceholders: z.array(z.string()),
  faqSchema: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

const SYSTEM_PROMPT = `You are an expert SEO content writer. Write comprehensive, authoritative pillar posts that serve as the cornerstone content for a topic silo. Your content should be well-structured with clear headings, actionable information, and natural keyword placement. Write in a professional but accessible tone.`;

/**
 * Pillar Post Generation Chain
 *
 * Generates comprehensive pillar posts (2000-3000 words) with SEO-optimized
 * HTML content, Slim SEO meta, internal link placeholders, and FAQ schema.
 */
export class PillarPostChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async generate(
    pillarPlan: PillarPlanItem,
    siloName: string,
    businessNiche: string,
    location: string,
    supportingPostTitles: string[]
  ): Promise<GeneratedPillarPost> {
    const prompt = `Write a comprehensive pillar post for a ${businessNiche} business in ${location}.

## Post Details
- Title: ${pillarPlan.title}
- Target Keyword: ${pillarPlan.targetKeyword}
- Target Word Count: ${pillarPlan.estimatedWordCount} words
- Silo/Category: ${siloName}

## Content Outline
${pillarPlan.outline.map((section, i) => `${i + 1}. ${section}`).join('\n')}

## Supporting Posts to Link To
${supportingPostTitles.map(t => `- "${t}" → use placeholder: [LINK:${t}]`).join('\n')}

## Requirements

### Content (HTML)
- Write ${pillarPlan.estimatedWordCount} words of SEO-optimized content
- Use proper HTML tags: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>
- Include the target keyword naturally in the first paragraph
- Use local keywords (${location}) throughout
- Include internal link placeholders: [LINK:Post Title] for each supporting post
- Add a compelling introduction and strong conclusion
- Include data points, statistics, or expert-level insights where appropriate
- DO NOT use <h1> — WordPress handles that via the title

### SEO Meta
- slimSeoMeta.title: 50-60 chars, include primary keyword
- slimSeoMeta.description: 150-160 chars, compelling with CTA
- excerpt: 1-2 sentence summary

### FAQ Schema
- Generate 4-6 FAQs related to the topic
- Answers should be concise but informative (2-3 sentences each)
- Include local and keyword variations in questions

### Tags
- Suggest 3-5 relevant tags for this content`;

    return this.ollama.generateStructured(prompt, PillarPostSchema, SYSTEM_PROMPT);
  }
}
