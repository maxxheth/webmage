import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { HaroQuery, HaroRelevanceScore } from '../../types/haro.js';

/**
 * Zod schema for relevance score output
 */
const RelevanceScoreSchema = z.object({
  score: z.number().min(0).max(100).describe('Relevance score from 0 (completely irrelevant) to 100 (perfect match)'),
  reasoning: z.string().describe('Brief explanation of why this score was given'),
  matchedExpertise: z.array(z.string()).describe('Specific areas of expertise that match the query'),
  suggestedAngle: z.string().describe('The best angle for responding to this query given the business expertise'),
});

/**
 * Scores HARO queries for relevance to the business niche.
 *
 * High-scoring queries (≥ threshold) proceed to response drafting.
 * Low-scoring queries are logged and skipped.
 */
export class HaroRelevanceScorerChain {
  private ollama: OllamaService;
  private threshold: number;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
    this.threshold = parseInt(process.env.HARO_MIN_RELEVANCE || '60', 10);
  }

  /**
   * Score a single query for relevance
   */
  async score(query: HaroQuery, businessContext: string): Promise<HaroRelevanceScore> {
    const prompt = `You are an expert PR strategist evaluating journalist source requests for relevance to a specific business.

BUSINESS CONTEXT:
${businessContext}

JOURNALIST QUERY:
- Journalist: ${query.journalistName}
- Outlet: ${query.outlet}
- Topic: ${query.topic}
- Requirements: ${query.requirements.join('; ')}
- Deadline: ${query.deadline}
- Platform: ${query.platform}

---

Score this query from 0-100 based on:
- How well the business expertise matches the journalist's needs (40% weight)
- How prestigious/relevant the outlet is for the business's audience (20% weight)
- Whether the business can genuinely provide expert insight on this topic (30% weight)
- Feasibility of responding before the deadline (10% weight)

Be honest and conservative with scoring. Only score 60+ if there's a genuine, natural fit.
Score 80+ only if the business is an ideal expert source for exactly this topic.

Also suggest the best angle for responding — what specific expertise or perspective would make the business stand out as a source.`;

    const result = await this.ollama.generateStructured(prompt, RelevanceScoreSchema);

    return {
      query,
      ...result,
    };
  }

  /**
   * Score a batch of queries and filter by relevance threshold
   */
  async scoreBatch(
    queries: HaroQuery[],
    businessContext: string
  ): Promise<{ relevant: HaroRelevanceScore[]; skipped: HaroRelevanceScore[] }> {
    const relevant: HaroRelevanceScore[] = [];
    const skipped: HaroRelevanceScore[] = [];

    for (const query of queries) {
      try {
        const scored = await this.score(query, businessContext);

        if (scored.score >= this.threshold) {
          relevant.push(scored);
          console.log(`  ✓ RELEVANT (${scored.score}/100): "${query.topic}" — ${query.outlet}`);
        } else {
          skipped.push(scored);
          console.log(`  ⊘ SKIP (${scored.score}/100): "${query.topic}" — ${query.outlet}`);
        }
      } catch (error) {
        console.warn(`  ⚠ Failed to score query "${query.topic}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { relevant, skipped };
  }

  /**
   * Get the current relevance threshold
   */
  getThreshold(): number {
    return this.threshold;
  }
}
