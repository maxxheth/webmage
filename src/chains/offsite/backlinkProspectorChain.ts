import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { OutreachTemplate } from '../../types/social.js';

const OutreachSchema = z.object({
  type: z.enum(['guest_post', 'resource_page', 'broken_link', 'skyscraper']),
  targetUrl: z.string(),
  subjectLine: z.string(),
  emailBody: z.string(),
  contentAngle: z.string(),
  notes: z.string(),
});

const OutreachOutputSchema = z.object({
  templates: z.array(OutreachSchema),
});

const SYSTEM_PROMPT = `You are a digital PR and link building expert. Create personalized, non-spammy outreach templates that provide genuine value to the recipient. Focus on building real relationships, not just extracting links. Each template should feel personal and reference specific content.`;

/**
 * Backlink Prospector Chain
 *
 * Analyzes content topics and generates outreach email templates for
 * various link building strategies: guest posts, resource pages,
 * broken link building, and skyscraper technique.
 */
export class BacklinkProspectorChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async generate(
    contentTopics: string[],
    businessName: string,
    businessWebsite: string,
    businessNiche: string,
    templateCount = 4
  ): Promise<OutreachTemplate[]> {
    const prompt = `Generate ${templateCount} backlink outreach email templates for a ${businessNiche} business.

## Business
- Name: ${businessName}
- Website: ${businessWebsite}
- Niche: ${businessNiche}

## Content Topics Available for Pitching
${contentTopics.map(t => `- ${t}`).join('\n')}

## Requirements
Generate ${templateCount} outreach templates, mixing these strategies:

1. **Guest Post Pitch**: Propose writing a valuable article for a relevant blog
2. **Resource Page**: Suggest adding our content to an existing resource/links page
3. **Broken Link**: Offer our content as a replacement for a broken link
4. **Skyscraper**: Pitch our comprehensive content as a better resource than an existing one

For each template:
- type: The strategy type
- targetUrl: Example URL pattern to target (e.g., "[industry-blog]/write-for-us")
- subjectLine: Engaging email subject (personalization tokens: {name}, {site})
- emailBody: Complete email template with personalization tokens: {name}, {site}, {post_title}, {our_url}
- contentAngle: The specific value proposition for the recipient
- notes: Tips for finding targets and personalizing the template

Email guidelines:
- Keep emails under 150 words
- Lead with value, not the ask
- Be specific about what you can offer
- Include a soft CTA, not demanding
- Sound human, not templated`;

    const result = await this.ollama.generateStructured(prompt, OutreachOutputSchema, SYSTEM_PROMPT);

    return result.templates;
  }
}
