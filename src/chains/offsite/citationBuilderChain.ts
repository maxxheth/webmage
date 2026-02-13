import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { CitationPackage } from '../../types/social.js';

const CitationSchema = z.object({
  directoryName: z.string(),
  directoryUrl: z.string(),
  category: z.string(),
  description: z.string(),
  notes: z.string(),
});

const CitationOutputSchema = z.object({
  citations: z.array(CitationSchema),
});

const SYSTEM_PROMPT = `You are a local SEO expert specializing in citation building. Generate accurate, compelling business descriptions optimized for each directory platform. Descriptions should be unique per directory to avoid duplicate content penalties.`;

/**
 * Citation Builder Chain
 *
 * Generates structured NAP citation data packages ready for manual or
 * semi-automated submission to local business directories.
 */
export class CitationBuilderChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async generate(
    businessName: string,
    businessAddress: string,
    businessPhone: string,
    businessWebsite: string,
    businessNiche: string,
    targetDirectories?: string[]
  ): Promise<CitationPackage[]> {
    const directories = targetDirectories || [
      'Google Business Profile',
      'Yelp',
      'Yellow Pages',
      'BBB (Better Business Bureau)',
      'Angi (Angie\'s List)',
      'Thumbtack',
      'HomeAdvisor',
      'Facebook Business',
      'Apple Maps',
      'Bing Places',
      'Nextdoor Business',
      'Manta',
    ];

    const prompt = `Generate unique business descriptions for local directory citations.

## Business Details
- Name: ${businessName}
- Address: ${businessAddress}
- Phone: ${businessPhone}
- Website: ${businessWebsite}
- Industry: ${businessNiche}

## Target Directories
${directories.map(d => `- ${d}`).join('\n')}

## Requirements
For each directory, generate:
- directoryName: Exact name of the directory
- directoryUrl: URL where the listing would be created
- category: Best-fit category for this business on that directory
- description: A UNIQUE business description (120-300 chars) tailored for that directory's audience
- notes: Any special instructions for submission (e.g., "requires phone verification", "claim existing listing first")

Each description should:
- Be unique (no duplicates across directories)
- Include the location naturally
- Highlight different aspects of the business
- Match the tone of the directory (professional for BBB, casual for Yelp, etc.)`;

    const result = await this.ollama.generateStructured(prompt, CitationOutputSchema, SYSTEM_PROMPT);

    return result.citations.map(citation => ({
      ...citation,
      fields: {
        businessName,
        address: businessAddress,
        phone: businessPhone,
        website: businessWebsite,
        description: citation.description,
      },
      status: 'pending' as const,
      notes: citation.notes,
    }));
  }
}
