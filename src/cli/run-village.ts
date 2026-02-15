import { Logger, printSummary } from '../utils/logger.js';
import { runOnsitePipeline } from './run-onsite-pipeline.js';
import { runOffsitePipeline } from './run-offsite-pipeline.js';
import { isMultisiteEnabled } from '../utils/multisiteLoader.js';
import { runMultisite } from './run-multisite.js';
import type { PipelineConfig, ProcessingResult } from '../types/wordpress.js';
import * as dotenv from 'dotenv';

if (!process.env.__WEBMAGE_DOTENV_LOADED) {
  dotenv.config();
  process.env.__WEBMAGE_DOTENV_LOADED = '1';
}

const log = new Logger('VILLAGE');

function parseArgs(): PipelineConfig {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    skipExisting: !args.includes('--force'),
    batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '10', 10),
    delayBetweenRequests: parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '3000', 10),
    maxRetries: 3,
    retryDelay: 5000,
  };
}

async function main(): Promise<void> {
  // If multisite config is enabled, delegate entirely to the multisite runner
  if (isMultisiteEnabled()) {
    log.info('Multisite config detected — delegating to multisite orchestrator...');
    await runMultisite();
    return;
  }

  const config = parseArgs();

  log.header('🏘️  WEBMAGE - AGENTIC SEO VILLAGE');
  log.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  log.info('Running ONSITE and OFFSITE teams concurrently...');
  log.divider();

  const startTime = Date.now();

  // Run both teams concurrently and independently
  const [onsiteResult, offsiteResult] = await Promise.allSettled([
    runOnsitePipeline(config),
    runOffsitePipeline(config),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Collect results
  log.divider('═');
  log.info('VILLAGE SUMMARY');
  log.divider();

  let onsiteResults: ProcessingResult[] = [];
  let offsiteResults: ProcessingResult[] = [];

  if (onsiteResult.status === 'fulfilled') {
    onsiteResults = onsiteResult.value;
    log.success(`Onsite SEO team completed: ${onsiteResults.filter(r => r.success).length} succeeded`);
  } else {
    log.error(`Onsite SEO team failed: ${onsiteResult.reason}`);
  }

  if (offsiteResult.status === 'fulfilled') {
    offsiteResults = offsiteResult.value;
    log.success(`Offsite SEO team completed: ${offsiteResults.filter(r => r.success).length} succeeded`);
  } else {
    log.error(`Offsite SEO team failed: ${offsiteResult.reason}`);
  }

  const allResults = [...onsiteResults, ...offsiteResults];
  printSummary('COMBINED VILLAGE RESULTS', allResults);

  log.info(`\n⏱️  Total time: ${elapsed}s`);
  log.saveLog({
    pipeline: 'village',
    config,
    elapsed: `${elapsed}s`,
    onsiteStatus: onsiteResult.status,
    offsiteStatus: offsiteResult.status,
    onsiteResults,
    offsiteResults,
  }, 'village');

  log.info('\n✅ Village run complete!\n');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
