import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { KeywordCluster, SiloPlan } from '../../types/seo.js';

const PillarPlanSchema = z.object({
  title: z.string(),
  targetKeyword: z.string(),
  outline: z.array(z.string()),
  estimatedWordCount: z.number(),
});

const SupportingPlanSchema = z.object({
  title: z.string(),
  targetKeyword: z.string(),
  linksBackToPillar: z.boolean(),
  estimatedWordCount: z.number(),
});

const SiloPlanSchema = z.object({
  name: z.string(),
  description: z.string(),
  pillar: PillarPlanSchema,
  supportingPosts: z.array(SupportingPlanSchema),
  categoryName: z.string(),
  tags: z.array(z.string()),
});

const SiloPlanOutputSchema = z.object({
  silos: z.array(SiloPlanSchema),
});

const SYSTEM_PROMPT = `You are an expert SEO content strategist specializing in silo architecture. Design content silos that maximize topical authority through strategic internal linking. Each silo should have one comprehensive pillar post surrounded by supporting posts that link back to it.`;

/**
 * Silo Planner Chain
 *
 * Takes keyword clusters → designs a silo architecture with pillar pages,
 * supporting posts, categories, tags, and internal linking plan.
 */
export class SiloPlannerChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async plan(
    businessNiche: string,
    location: string,
    keywordClusters: KeywordCluster[]
  ): Promise<SiloPlan[]> {
    const prompt = `Design a content silo architecture based on these keyword clusters.

## Business Context
- Niche: ${businessNiche}
- Location: ${location}

## Keyword Clusters
${keywordClusters.map((cluster, i) => `
### Cluster ${i + 1}: ${cluster.primaryKeyword}
- Related: ${cluster.relatedKeywords.join(', ')}
- Intent: ${cluster.searchIntent}
- Difficulty: ${cluster.estimatedDifficulty}
- Suggested type: ${cluster.suggestedContentType}
`).join('\n')}

## Requirements for Each Silo
1. **Pillar Post**: 2000-3000 word comprehensive guide
   - Target the primary keyword
   - Include an outline with 5-8 H2 sections
   - Links to all supporting posts in the silo

2. **Supporting Posts**: 3-5 per silo, 800-1500 words each
   - Each targets a related keyword from the cluster
   - Each links back to the pillar post
   - Each covers a specific subtopic in depth

3. **Taxonomy**:
   - One WordPress category per silo
   - 3-5 tags per silo for cross-silo discovery

4. Create one silo per "pillar" keyword cluster, and distribute "supporting" clusters as posts within the most relevant silo.`;

    const result = await this.ollama.generateStructured(
      prompt,
      SiloPlanOutputSchema,
      SYSTEM_PROMPT
    );

    return result.silos;
  }
}
