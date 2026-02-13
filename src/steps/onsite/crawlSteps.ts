import axios from 'axios';
import type { Step } from '../../utils/pipeline.js';
import type { CrawlResult } from '../../types/seo.js';

/**
 * Memory structure for crawl pipeline steps
 */
export interface CrawlPipelineMemory {
  scrapyUrl: string;
  targetUrl: string;
  crawlResult?: CrawlResult;
  dryRun: boolean;
}

/**
 * Step: Trigger a full site crawl via the Scrapy microservice
 */
export const triggerCrawlStep: Step<string> = async (ctx) => {
  const { scrapyUrl, targetUrl, dryRun } = ctx.memory as CrawlPipelineMemory;

  if (dryRun) {
    console.log(`  ⊘ [DRY RUN] Would crawl: ${targetUrl}`);
    (ctx.memory as CrawlPipelineMemory).crawlResult = {
      domain: new URL(targetUrl).hostname,
      crawled_at: new Date().toISOString(),
      total_pages: 0,
      pages: [],
      errors: [],
    };
    return ctx;
  }

  console.log(`  → Triggering crawl of ${targetUrl}...`);

  try {
    const response = await axios.post<CrawlResult>(
      `${scrapyUrl}/crawl`,
      { url: targetUrl },
      { timeout: 300000 } // 5 min timeout for full crawl
    );

    const crawlResult = response.data;
    (ctx.memory as CrawlPipelineMemory).crawlResult = crawlResult;
    console.log(`  ✓ Crawl complete: ${crawlResult.total_pages} pages found`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Scrapy crawl failed: [${error.response?.status}] ${error.message}`);
    }
    throw new Error(`Scrapy crawl failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return ctx;
};

/**
 * Step: Parse and validate crawl results
 */
export const parseCrawlResultsStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as CrawlPipelineMemory;
  const crawlResult = memory.crawlResult;

  if (!crawlResult) {
    throw new Error('No crawl results available');
  }

  if (crawlResult.total_pages === 0 && !memory.dryRun) {
    console.warn('  ⚠ Crawl returned 0 pages — site may be unreachable or blocked');
  }

  if (crawlResult.errors.length > 0) {
    console.warn(`  ⚠ ${crawlResult.errors.length} crawl error(s):`);
    crawlResult.errors.slice(0, 5).forEach(err => {
      console.warn(`    - [${err.status_code}] ${err.url}: ${err.error}`);
    });
  }

  ctx.output = crawlResult;
  return ctx;
};
