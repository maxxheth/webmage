import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { SiteAudit, KeywordCluster } from '../../types/seo.js';

const KeywordClusterSchema = z.object({
  primaryKeyword: z.string(),
  relatedKeywords: z.array(z.string()),
  searchIntent: z.enum(['informational', 'transactional', 'navigational', 'commercial']),
  estimatedDifficulty: z.enum(['easy', 'medium', 'hard']),
  suggestedContentType: z.enum(['pillar', 'supporting', 'page']),
});

const KeywordResearchOutputSchema = z.object({
  clusters: z.array(KeywordClusterSchema),
});

const SYSTEM_PROMPT = `You are an expert SEO keyword researcher. Analyze the business niche, location, and existing content to identify keyword clusters with clear search intent mapping. Prioritize long-tail keywords that are achievable for small-to-medium businesses. Group keywords into logical clusters that can form content silos.`;

/**
 * Keyword Research Chain
 *
 * Takes business context + existing content inventory → produces keyword clusters
 * grouped by search intent and content type.
 */
export class KeywordResearchChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async research(
    businessNiche: string,
    location: string,
    audit: SiteAudit,
    targetClusterCount = 5
  ): Promise<KeywordCluster[]> {
    const existingTopics = audit.existingContent
      .map(c => c.title)
      .filter(t => t !== 'Untitled')
      .slice(0, 30);

    const prompt = `Perform keyword research for a local business website.

## Business Context
- Niche: ${businessNiche}
- Location: ${location}
- Website: ${audit.domain}

## Existing Content (${audit.existingContent.length} pages)
${existingTopics.length > 0 ? existingTopics.map(t => `- ${t}`).join('\n') : 'No meaningful content found'}

## Content Gaps from Audit
${audit.opportunities
  .filter(o => o.type === 'missing_content' || o.type === 'thin_content')
  .map(o => `- ${o.description}`)
  .join('\n') || 'None identified'}

## Requirements
Generate ${targetClusterCount} keyword clusters that:
1. Include both pillar-worthy and supporting topics
2. Cover informational, transactional, and commercial intents
3. Include local keywords (city/region variations)
4. Avoid overlapping with existing strong content
5. Each cluster should have 4-8 related keywords
6. Prioritize achievable difficulty for a smaller business
7. At least 1-2 clusters should be "pillar" content type`;

    const result = await this.ollama.generateStructured(
      prompt,
      KeywordResearchOutputSchema,
      SYSTEM_PROMPT
    );

    return result.clusters;
  }
}
