import { OllamaService } from '../services/ollamaService.js';
import { WordPressService } from '../services/wordpressService.js';
import { Pipeline } from '../utils/pipeline.js';
import { Logger, printSummary } from '../utils/logger.js';
import { InputLoader } from '../utils/inputLoader.js';
import { triggerCrawlStep, parseCrawlResultsStep, type CrawlPipelineMemory } from '../steps/onsite/crawlSteps.js';
import { auditStep, keywordResearchStep, siloPlanStep, type PlanningPipelineMemory } from '../steps/onsite/planningSteps.js';
import {
  generatePillarStep,
  generateSupportingPostsStep,
  publishStep,
  type ContentPipelineMemory,
} from '../steps/onsite/contentSteps.js';
import type { PipelineConfig, ProcessingResult } from '../types/wordpress.js';
import type { CrawlResult, SiloPlan } from '../types/seo.js';
import * as dotenv from 'dotenv';

if (!process.env.__WEBMAGE_DOTENV_LOADED) {
  dotenv.config();
  process.env.__WEBMAGE_DOTENV_LOADED = '1';
}

const log = new Logger('ONSITE');

function parseArgs(): PipelineConfig {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    skipExisting: !args.includes('--force'),
    batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '10', 10),
    delayBetweenRequests: parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '3000', 10),
    maxRetries: 3,
    retryDelay: 5000,
    targetSilo: args.find(a => a.startsWith('--silo='))?.split('=')[1],
  };
}

export async function runOnsitePipeline(
  configOverride?: Partial<PipelineConfig>,
  inputDir?: string,
): Promise<ProcessingResult[]> {
  const config = { ...parseArgs(), ...configOverride };

  log.header('🕸️  WEBMAGE - ONSITE SEO PIPELINE');
  log.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  log.info(`Skip existing: ${config.skipExisting}`);
  if (config.targetSilo) log.info(`Target silo: ${config.targetSilo}`);
  log.divider();

  // Validate env
  const required = ['OLLAMA_API_KEY', 'WP_BASE_URL', 'WP_USERNAME', 'WP_APP_PASSWORD'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    log.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Init services
  log.info('Initializing services...');
  const ollama = new OllamaService();
  const wp = new WordPressService();

  // Test connections
  log.info('Testing Ollama Cloud connection...');
  const ollamaOk = await ollama.testConnection();
  if (!ollamaOk) {
    log.error('Ollama Cloud connection failed. Aborting.');
    process.exit(1);
  }
  log.success('Ollama Cloud connected');

  log.info('Testing WordPress connection...');
  const wpOk = await wp.testConnection();
  if (!wpOk) {
    log.error('WordPress connection failed. Aborting.');
    process.exit(1);
  }

  const scrapyUrl = process.env.SCRAPY_URL || 'http://localhost:6800';
  const targetUrl = process.env.WP_BASE_URL!;
  const businessNiche = process.env.BUSINESS_NAME || 'local business';
  const location = process.env.BUSINESS_ADDRESS?.split(',').slice(-2).join(',').trim() || 'local area';

  // Init input loader
  const inputLoader = new InputLoader(inputDir);
  log.divider();
  log.info('Scanning for input files...');
  inputLoader.logDiscoveredFiles('onsite');

  // Phase 1: Crawl
  log.divider('═');
  log.info('PHASE 1: Site Crawl');
  log.divider();

  const crawlPipeline = new Pipeline<string>({
    input: targetUrl,
    memory: {
      scrapyUrl,
      targetUrl,
      dryRun: config.dryRun,
      inputLoader,
    } as CrawlPipelineMemory,
  })
    .pipe(triggerCrawlStep)
    .pipe(parseCrawlResultsStep);

  const crawlCtx = await crawlPipeline.run();
  if (crawlCtx.error) {
    log.error(`Crawl failed: ${crawlCtx.error.message}`);
    // Continue with empty crawl in dry-run mode
    if (!config.dryRun) process.exit(1);
  }

  const crawlResult = (crawlCtx.memory as CrawlPipelineMemory).crawlResult!;

  // Phase 2: Analysis & Planning
  log.divider('═');
  log.info('PHASE 2: Analysis & Planning');
  log.divider();

  const planningPipeline = new Pipeline<CrawlResult>({
    input: crawlResult,
    memory: {
      ollama,
      crawlResult,
      businessNiche,
      location,
      dryRun: config.dryRun,
      targetClusterCount: 5,
      inputLoader,
    } as PlanningPipelineMemory,
  })
    .pipe(auditStep)
    .pipe(keywordResearchStep)
    .pipe(siloPlanStep);

  const planCtx = await planningPipeline.run();
  if (planCtx.error) {
    log.error(`Planning failed: ${planCtx.error.message}`);
    if (!config.dryRun) process.exit(1);
  }

  const silos = (planCtx.memory as PlanningPipelineMemory).silos || [];

  // Phase 3: Content Generation & Publishing
  log.divider('═');
  log.info('PHASE 3: Content Generation & Publishing');
  log.divider();

  const allResults: ProcessingResult[] = [];

  const targetSilos = config.targetSilo
    ? silos.filter(s => s.name.toLowerCase().includes(config.targetSilo!.toLowerCase()))
    : silos;

  for (let i = 0; i < targetSilos.length; i++) {
    const silo = targetSilos[i];
    log.info(`\n[${ i + 1}/${targetSilos.length}] Silo: "${silo.name}"`);
    log.divider();

    const contentPipeline = new Pipeline<SiloPlan>({
      input: silo,
      memory: {
        ollama,
        wp,
        config,
        silo,
        businessNiche,
        location,
        results: [],
      } as ContentPipelineMemory,
    })
      .pipe(generatePillarStep)
      .pipe(generateSupportingPostsStep)
      .pipe(publishStep);

    const contentCtx = await contentPipeline.run();
    const results = (contentCtx.memory as ContentPipelineMemory).results;
    allResults.push(...results);

    if (contentCtx.error) {
      log.error(`Silo "${silo.name}" failed: ${contentCtx.error.message}`);
    }
  }

  // Summary
  printSummary('ONSITE SEO PIPELINE SUMMARY', allResults);
  log.saveLog({
    pipeline: 'onsite',
    config,
    results: allResults,
    siloCount: targetSilos.length,
  }, 'onsite-pipeline');

  log.info('\n✅ Onsite SEO pipeline complete!\n');
  return allResults;
}

// Direct execution
if (process.argv[1]?.includes('run-onsite-pipeline')) {
  runOnsitePipeline().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
