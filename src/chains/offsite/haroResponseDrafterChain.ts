import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { HaroRelevanceScore, HaroDraftResponse } from '../../types/haro.js';

/**
 * Zod schema for the drafted response
 */
const DraftResponseSchema = z.object({
  subjectLine: z.string().describe('Email subject line for the response'),
  responseBody: z.string().describe('Full email response body (professional, concise, ready to send)'),
  expertQuote: z.string().describe('A standalone expert quote the journalist can use directly in their article'),
  credentials: z.string().describe('Relevant credentials and expertise that qualify the sender as a source'),
  bio: z.string().describe('Brief professional bio (2-3 sentences)'),
});

/**
 * Generates personalized expert response drafts for high-scoring HARO queries.
 *
 * Produces human-reviewable responses including:
 * - Professional email with personalized content
 * - A ready-to-use quote for the journalist
 * - Credentials and bio
 *
 * All responses are saved for human review — NEVER auto-sent.
 */
export class HaroResponseDrafterChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  /**
   * Draft a response for a relevant HARO query
   */
  async draft(
    scored: HaroRelevanceScore,
    businessContext: string,
    contactInfo: string
  ): Promise<HaroDraftResponse> {
    const { query, suggestedAngle, matchedExpertise } = scored;

    const prompt = `You are an expert PR writer drafting a response to a journalist looking for sources. The response should be professional, concise, and compelling.

JOURNALIST QUERY:
- Journalist: ${query.journalistName}
- Outlet: ${query.outlet}
- Topic: ${query.topic}
- Requirements: ${query.requirements.join('; ')}
- Deadline: ${query.deadline}
- Platform: ${query.platform}

BUSINESS CONTEXT:
${businessContext}

SUGGESTED ANGLE:
${suggestedAngle}

MATCHED EXPERTISE:
${matchedExpertise.join(', ')}

CONTACT INFO:
${contactInfo}

---

Draft a complete HARO response with these components:

1. SUBJECT LINE: Brief, specific, mentions the topic (10-15 words max)

2. RESPONSE BODY: A professional email that:
   - Opens with a brief, personalized greeting referencing the journalist's specific need
   - Explains WHY the sender is qualified to speak on this topic (1-2 sentences)
   - Provides 2-3 specific, substantive talking points or insights on the topic
   - Includes a ~50-word ready-to-use quote the journalist can directly include in their article
   - Keeps total length under 300 words — journalists prefer concise responses
   - Closes with availability for follow-up
   - Tone: authoritative but approachable, not salesy

3. EXPERT QUOTE: A standalone quote (2-3 sentences) that provides genuine insight and can be directly quoted in the article. Must sound natural, not promotional.

4. CREDENTIALS: Relevant experience and qualifications (2-3 bullet points)

5. BIO: 2-3 sentence professional bio

IMPORTANT: Do NOT be generic. Reference the specific topic and journalist's needs. Journalists receive hundreds of pitches — this must stand out through specificity and genuine expertise.`;

    const result = await this.ollama.generateStructured(prompt, DraftResponseSchema);

    return {
      query,
      relevanceScore: scored.score,
      subjectLine: result.subjectLine,
      responseBody: result.responseBody,
      expertQuote: result.expertQuote,
      credentials: result.credentials,
      bio: result.bio,
      contactInfo,
      draftedAt: new Date().toISOString(),
      status: 'drafted',
    };
  }

  /**
   * Draft responses for multiple relevant queries
   */
  async draftBatch(
    scored: HaroRelevanceScore[],
    businessContext: string,
    contactInfo: string
  ): Promise<HaroDraftResponse[]> {
    const drafts: HaroDraftResponse[] = [];

    for (const item of scored) {
      try {
        const draft = await this.draft(item, businessContext, contactInfo);
        drafts.push(draft);
        console.log(`  ✓ Drafted response for "${item.query.topic}" → ${item.query.outlet}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to draft response for "${item.query.topic}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return drafts;
  }
}
