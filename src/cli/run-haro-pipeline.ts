import { OllamaService } from '../services/ollamaService.js';
import { ImapService } from '../services/imapService.js';
import { Pipeline } from '../utils/pipeline.js';
import { Logger } from '../utils/logger.js';
import { InputLoader } from '../utils/inputLoader.js';
import {
  fetchEmailsStep,
  parseQueriesStep,
  scoreRelevanceStep,
  draftResponsesStep,
  saveResponsesStep,
  type HaroPipelineMemory,
} from '../steps/offsite/haroSteps.js';
import type { PipelineConfig } from '../types/wordpress.js';
import * as dotenv from 'dotenv';

if (!process.env.__WEBMAGE_DOTENV_LOADED) {
  dotenv.config();
  process.env.__WEBMAGE_DOTENV_LOADED = '1';
}

const log = new Logger('HARO');

function parseArgs(): PipelineConfig {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    skipExisting: true,
    batchSize: 50,
    delayBetweenRequests: 2000,
    maxRetries: 3,
    retryDelay: 5000,
  };
}

export async function runHaroPipeline(
  configOverride?: Partial<PipelineConfig>,
  inputDir?: string,
): Promise<void> {
  const config = { ...parseArgs(), ...configOverride };

  log.header('📰 WEBMAGE - HARO JOURNALIST OUTREACH PIPELINE');
  log.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  log.divider();

  // Validate env
  const required = ['OLLAMA_API_KEY', 'IMAP_USER', 'IMAP_PASSWORD'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    log.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Init services
  log.info('Initializing services...');
  const ollama = new OllamaService();
  const imap = new ImapService();

  // Test Ollama
  log.info('Testing Ollama Cloud connection...');
  const ollamaOk = await ollama.testConnection();
  if (!ollamaOk) {
    log.error('Ollama Cloud connection failed. Aborting.');
    process.exit(1);
  }
  log.success('Ollama Cloud connected');

  // Build business context from env
  const businessName = process.env.BUSINESS_NAME || 'Business';
  const businessNiche = process.env.BUSINESS_NICHE || process.env.BUSINESS_NAME || 'business';
  const businessWebsite = process.env.BUSINESS_WEBSITE || process.env.WP_BASE_URL || '';

  const businessContext = `
Business: ${businessName}
Industry/Niche: ${businessNiche}
Website: ${businessWebsite}
Location: ${process.env.BUSINESS_ADDRESS || 'Not specified'}
Expertise areas: ${businessNiche}, local business, industry expertise
  `.trim();

  const contactInfo = `
Name: ${businessName}
Email: ${process.env.IMAP_USER}
Phone: ${process.env.BUSINESS_PHONE || 'Not provided'}
Website: ${businessWebsite}
  `.trim();

  const minRelevance = parseInt(process.env.HARO_MIN_RELEVANCE || '60', 10);
  log.info(`Minimum relevance threshold: ${minRelevance}/100`);

  // Init input loader
  const inputLoader = new InputLoader(inputDir);
  log.divider();
  log.info('Scanning for input files...');
  inputLoader.logDiscoveredFiles('offsite');

  // Run pipeline
  const pipeline = new Pipeline<string>({
    input: 'haro',
    memory: {
      ollama,
      imap,
      config,
      businessContext,
      contactInfo,
      emails: [],
      queries: [],
      relevant: [],
      skipped: [],
      drafts: [],
      inputLoader,
    } as HaroPipelineMemory,
  })
    .pipe(fetchEmailsStep)
    .pipe(parseQueriesStep)
    .pipe(scoreRelevanceStep)
    .pipe(draftResponsesStep)
    .pipe(saveResponsesStep);

  const result = await pipeline.run();

  // Disconnect
  try {
    await imap.disconnect();
  } catch {
    // Ignore disconnect errors
  }

  // Summary
  const memory = result.memory as HaroPipelineMemory;
  log.divider('═');
  log.info('HARO PIPELINE SUMMARY');
  log.divider();
  log.info(`Emails fetched:     ${memory.emails.length}`);
  log.info(`Queries parsed:     ${memory.queries.length}`);
  log.info(`Relevant (drafted): ${memory.relevant.length}`);
  log.info(`Skipped:            ${memory.skipped.length}`);
  log.info(`Responses drafted:  ${memory.drafts.length}`);

  if (memory.drafts.length > 0) {
    log.success(`\n📝 ${memory.drafts.length} response(s) ready for review in output/haro-responses/`);
    log.warn('⚠️  Remember: Review all responses before sending!');
  }

  log.saveLog({
    pipeline: 'haro',
    config,
    emailCount: memory.emails.length,
    queryCount: memory.queries.length,
    relevantCount: memory.relevant.length,
    skippedCount: memory.skipped.length,
    draftCount: memory.drafts.length,
  }, 'haro-pipeline');

  log.info('\n✅ HARO pipeline complete!\n');

  if (result.error) {
    log.error(`Pipeline error: ${result.error.message}`);
  }
}

// Direct execution
if (process.argv[1]?.includes('run-haro-pipeline')) {
  runHaroPipeline().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
