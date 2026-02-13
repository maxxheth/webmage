import { z } from 'zod';
import { OllamaService } from '../../services/ollamaService.js';
import type { CrawlResult, SiteAudit, ContentInventoryItem } from '../../types/seo.js';

/**
 * Zod schema for audit output
 */
const AuditIssueSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  category: z.enum(['technical', 'content', 'meta', 'performance', 'links']),
  description: z.string(),
  affectedPages: z.array(z.string()),
  recommendation: z.string(),
});

const AuditOpportunitySchema = z.object({
  type: z.enum(['missing_content', 'thin_content', 'missing_meta', 'internal_linking', 'schema']),
  description: z.string(),
  estimatedImpact: z.enum(['high', 'medium', 'low']),
  pages: z.array(z.string()),
});

const SiteAuditSchema = z.object({
  domain: z.string(),
  overallScore: z.number().min(0).max(100),
  issues: z.array(AuditIssueSchema),
  opportunities: z.array(AuditOpportunitySchema),
});

const SYSTEM_PROMPT = `You are an expert SEO auditor. Analyze website crawl data and produce actionable audit reports with prioritized issues and opportunities. Focus on technical SEO, content quality, meta tags, internal linking, and schema markup.`;

/**
 * Site Audit Chain
 *
 * Analyzes Scrapy crawl data and produces a structured site audit report
 * with issues, opportunities, and content inventory.
 */
export class SiteAuditChain {
  private ollama: OllamaService;

  constructor(ollama: OllamaService) {
    this.ollama = ollama;
  }

  async analyze(crawlResult: CrawlResult): Promise<SiteAudit> {
    const contentInventory = this.buildContentInventory(crawlResult);
    const crawlSummary = this.summarizeCrawl(crawlResult);

    const prompt = `Analyze this website crawl data and produce a detailed SEO audit.

## Crawl Summary
${crawlSummary}

## Page Details (first 30 pages)
${JSON.stringify(crawlResult.pages.slice(0, 30).map(p => ({
  url: p.url,
  title: p.title,
  meta_description: p.meta_description?.substring(0, 160) || 'MISSING',
  h1_count: p.h1.length,
  h1_text: p.h1[0] || 'MISSING',
  word_count: p.word_count,
  internal_links: p.internal_links.length,
  external_links: p.external_links.length,
  images_missing_alt: p.images.filter(i => i.missing_alt).length,
  schema_types: p.schema_types,
  response_time_ms: p.response_time_ms,
})), null, 2)}

## Crawl Errors
${crawlResult.errors.length > 0 ? JSON.stringify(crawlResult.errors.slice(0, 20), null, 2) : 'None'}

Produce a comprehensive audit with:
1. An overall SEO health score (0-100)
2. Issues categorized by severity (critical, warning, info) and type
3. Opportunities for improvement with estimated impact
4. Focus on actionable, specific recommendations`;

    const result = await this.ollama.generateStructured(prompt, SiteAuditSchema, SYSTEM_PROMPT);

    return {
      ...result,
      existingContent: contentInventory,
    };
  }

  private buildContentInventory(crawl: CrawlResult): ContentInventoryItem[] {
    return crawl.pages.map(page => ({
      url: page.url,
      title: page.title || 'Untitled',
      wordCount: page.word_count,
      hasMetaDescription: !!page.meta_description && page.meta_description.length > 10,
      hasFeaturedImage: page.images.length > 0,
      categories: [],
      internalLinksIn: crawl.pages.filter(p =>
        p.internal_links.some(link => link.includes(new URL(page.url).pathname))
      ).length,
      internalLinksOut: page.internal_links.length,
    }));
  }

  private summarizeCrawl(crawl: CrawlResult): string {
    const pages = crawl.pages;
    const pagesWithMeta = pages.filter(p => p.meta_description && p.meta_description.length > 10);
    const pagesWithSchema = pages.filter(p => p.schema_types.length > 0);
    const thinPages = pages.filter(p => p.word_count < 300);
    const missingH1 = pages.filter(p => p.h1.length === 0);
    const multiH1 = pages.filter(p => p.h1.length > 1);
    const missingAlt = pages.reduce((sum, p) => sum + p.images.filter(i => i.missing_alt).length, 0);

    return `
- Domain: ${crawl.domain}
- Total pages crawled: ${pages.length}
- Pages with meta descriptions: ${pagesWithMeta.length}/${pages.length}
- Pages with schema markup: ${pagesWithSchema.length}/${pages.length}
- Thin content pages (<300 words): ${thinPages.length}
- Pages missing H1: ${missingH1.length}
- Pages with multiple H1s: ${multiH1.length}
- Images missing alt text: ${missingAlt}
- Crawl errors: ${crawl.errors.length}
- Average response time: ${Math.round(pages.reduce((s, p) => s + p.response_time_ms, 0) / pages.length)}ms`;
  }
}
