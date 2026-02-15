import { OllamaService } from '../services/ollamaService.js';
import { WordPressService } from '../services/wordpressService.js';
import { MakeService } from '../services/makeService.js';
import { Pipeline } from '../utils/pipeline.js';
import { Logger, printSummary } from '../utils/logger.js';
import { InputLoader } from '../utils/inputLoader.js';
import {
  fetchPublishedContentStep,
  generateSocialPostsStep,
  pushToBufferStep,
  type SocialPipelineMemory,
} from '../steps/offsite/socialSteps.js';
import {
  generateCitationPackagesStep,
  generateOutreachStep,
  saveCitationFilesStep,
  type CitationPipelineMemory,
} from '../steps/offsite/citationSteps.js';
import type { PipelineConfig, ProcessingResult } from '../types/wordpress.js';
import * as dotenv from 'dotenv';

dotenv.config();

const log = new Logger('OFFSITE');

function parseArgs(): PipelineConfig {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    skipExisting: !args.includes('--force'),
    batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '5', 10),
    delayBetweenRequests: parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '2000', 10),
    maxRetries: 3,
    retryDelay: 5000,
  };
}

export async function runOffsitePipeline(configOverride?: Partial<PipelineConfig>): Promise<ProcessingResult[]> {
  const config = { ...parseArgs(), ...configOverride };

  log.header('📢 WEBMAGE - OFFSITE SEO / SOCIAL MEDIA PIPELINE');
  log.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
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

  // Test Ollama
  log.info('Testing Ollama Cloud connection...');
  const ollamaOk = await ollama.testConnection();
  if (!ollamaOk) {
    log.error('Ollama Cloud connection failed. Aborting.');
    process.exit(1);
  }
  log.success('Ollama Cloud connected');

  // Test WordPress
  log.info('Testing WordPress connection...');
  const wpOk = await wp.testConnection();
  if (!wpOk) {
    log.error('WordPress connection failed. Aborting.');
    process.exit(1);
  }

  const allResults: ProcessingResult[] = [];
  const businessName = process.env.BUSINESS_NAME || 'Business';

  // Init input loader
  const inputLoader = new InputLoader();
  log.divider();
  log.info('Scanning for input files...');
  inputLoader.logDiscoveredFiles('offsite');

  // ─── Social Media Pipeline ───
  log.divider('═');
  log.info('PHASE 1: Social Media Content');
  log.divider();

  // Init Make service (optional — may not be configured)
  let make: MakeService | null = null;
  try {
    make = new MakeService();
    if (!config.dryRun) {
      log.info('Testing Make webhook...');
      await make.testWebhook();
    }
  } catch {
    log.warn('Make webhook not configured — social posts will be generated but not pushed');
  }

  const socialPipeline = new Pipeline<string>({
    input: 'social',
    memory: {
      ollama,
      wp,
      make: make!,
      config,
      businessName,
      results: [],
      inputLoader,
    } as SocialPipelineMemory,
  })
    .pipe(fetchPublishedContentStep)
    .pipe(generateSocialPostsStep);

  // Only push to buffer if Make is configured
  if (make) {
    const socialWithPush = socialPipeline.pipe(pushToBufferStep);
    const socialCtx = await socialWithPush.run();
    allResults.push(...(socialCtx.memory as SocialPipelineMemory).results);
  } else {
    const socialCtx = await socialPipeline.run();
    allResults.push(...(socialCtx.memory as SocialPipelineMemory).results);
  }

  // ─── Citations & Backlinks Pipeline ───
  log.divider('═');
  log.info('PHASE 2: Citations & Backlink Outreach');
  log.divider();

  const businessAddress = process.env.BUSINESS_ADDRESS || '';
  const businessPhone = process.env.BUSINESS_PHONE || '';
  const businessWebsite = process.env.BUSINESS_WEBSITE || process.env.WP_BASE_URL || '';
  const businessNiche = process.env.BUSINESS_NAME || 'local business';

  // Get content topics from published posts
  const posts = await wp.getAllPosts();
  const contentTopics = posts
    .filter(p => p.status === 'publish' && wp.hasContent(p))
    .map(p => p.title.rendered)
    .slice(0, 10);

  const citationPipeline = new Pipeline<string>({
    input: 'citations',
    memory: {
      ollama,
      config,
      businessName,
      businessAddress,
      businessPhone,
      businessWebsite,
      businessNiche,
      contentTopics,
      inputLoader,
    } as CitationPipelineMemory,
  })
    .pipe(generateCitationPackagesStep)
    .pipe(generateOutreachStep)
    .pipe(saveCitationFilesStep);

  const citationCtx = await citationPipeline.run();
  if (citationCtx.error) {
    log.error(`Citation pipeline failed: ${citationCtx.error.message}`);
  }

  // Summary
  printSummary('OFFSITE SEO PIPELINE SUMMARY', allResults);
  log.saveLog({
    pipeline: 'offsite',
    config,
    results: allResults,
    citationCount: (citationCtx.memory as CitationPipelineMemory).citations?.length || 0,
    outreachCount: (citationCtx.memory as CitationPipelineMemory).outreach?.length || 0,
  }, 'offsite-pipeline');

  log.info('\n✅ Offsite SEO pipeline complete!\n');
  return allResults;
}

// Direct execution
if (process.argv[1]?.includes('run-offsite-pipeline')) {
  runOffsitePipeline().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
