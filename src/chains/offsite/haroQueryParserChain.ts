import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { HaroEmail, HaroQuery } from '../../types/haro.js';

/**
 * Zod schema for parsed HARO query
 */
const HaroQuerySchema = z.object({
  journalistName: z.string().describe('Full name of the journalist or editor'),
  outlet: z.string().describe('Publication, website, or media outlet name'),
  topic: z.string().describe('Main topic or subject of the query'),
  requirements: z.array(z.string()).describe('Specific requirements, qualifications, or types of sources sought'),
  deadline: z.string().describe('Deadline for response (date or timeframe, e.g. "February 15, 2025" or "48 hours")'),
});

/**
 * Parses raw HARO-style emails into structured query objects.
 *
 * Each journalist query platform formats their emails differently.
 * This chain uses structured output to reliably extract the key fields
 * regardless of platform formatting.
 */
export class HaroQueryParserChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  /**
   * Parse a single HARO email into a structured query
   */
  async parse(email: HaroEmail): Promise<HaroQuery> {
    const prompt = `You are an expert at parsing journalist source requests from platforms like HARO, Qwoted, Featured, Terkel, SourceBottle, JournoRequests, and Help a B2B Writer.

Parse the following email from the "${email.platform}" platform and extract the journalist query details.

EMAIL SUBJECT: ${email.subject}
EMAIL FROM: ${email.from}
EMAIL DATE: ${email.date.toISOString()}

EMAIL BODY:
${email.textBody || this.stripHtml(email.htmlBody)}

---

Extract the following information:
- journalistName: The journalist or editor's full name
- outlet: The publication or media outlet
- topic: The main topic they're writing about
- requirements: List of specific requirements or qualifications they want from sources
- deadline: When responses are due

If a field is not clearly present in the email, provide your best inference or "Not specified".`;

    const result = await this.ollama.generateStructured(prompt, HaroQuerySchema);

    return {
      ...result,
      sourceEmail: email.from,
      platform: email.platform,
      rawSubject: email.subject,
      rawEmailUid: email.uid,
    };
  }

  /**
   * Parse multiple emails in batch
   */
  async parseBatch(emails: HaroEmail[]): Promise<HaroQuery[]> {
    const queries: HaroQuery[] = [];

    for (const email of emails) {
      try {
        const query = await this.parse(email);
        queries.push(query);
      } catch (error) {
        console.warn(`  ⚠ Failed to parse query from ${email.from}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return queries;
  }

  /**
   * Basic HTML stripping for fallback text extraction
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000); // Cap at 5000 chars for prompt length
  }
}
