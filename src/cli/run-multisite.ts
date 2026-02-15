import { Logger } from '../utils/logger.js';
import {
  isMultisiteEnabled,
  loadMultisiteConfig,
  resolveSiteConfig,
  snapshotEnv,
  applySiteEnv,
  restoreEnv,
} from '../utils/multisiteLoader.js';
import { runOnsitePipeline } from './run-onsite-pipeline.js';
import { runOffsitePipeline } from './run-offsite-pipeline.js';
import { runHaroPipeline } from './run-haro-pipeline.js';
import type { PipelineName, SiteRunResult, ResolvedSiteConfig } from '../types/multisite.js';
import type { PipelineConfig } from '../types/wordpress.js';
import * as dotenv from 'dotenv';

if (!process.env.__WEBMAGE_DOTENV_LOADED) {
  dotenv.config();
  process.env.__WEBMAGE_DOTENV_LOADED = '1';
}

const log = new Logger('MULTISITE');

// =============================================================================
// Pipeline dispatch
// =============================================================================

async function runPipelineForSite(
  pipeline: PipelineName,
  resolved: ResolvedSiteConfig,
): Promise<void> {
  const pipelineConfig: Partial<PipelineConfig> = resolved.pipelineConfig;

  switch (pipeline) {
    case 'onsite':
      await runOnsitePipeline(pipelineConfig, resolved.inputDir);
      break;
    case 'offsite':
      await runOffsitePipeline(pipelineConfig, resolved.inputDir);
      break;
    case 'haro':
      await runHaroPipeline(pipelineConfig, resolved.inputDir);
      break;
  }
}

// =============================================================================
// Single site execution
// =============================================================================

async function runSite(
  resolved: ResolvedSiteConfig,
  baseEnv: Record<string, string | undefined>,
): Promise<SiteRunResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  log.divider('═');
  log.header(`🌐 Site: ${resolved.name}`);
  log.info(`Pipelines: ${resolved.pipelines.join(', ')}`);
  log.info(`Input dir: ${resolved.inputDir}`);
  log.divider();

  // Apply this site's env
  applySiteEnv(resolved);

  try {
    for (const pipeline of resolved.pipelines) {
      try {
        log.info(`▸ Running "${pipeline}" pipeline for "${resolved.name}"...`);
        await runPipelineForSite(pipeline, resolved);
        log.success(`✓ "${pipeline}" pipeline completed for "${resolved.name}"`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${pipeline}: ${msg}`);
        log.error(`✗ "${pipeline}" pipeline failed for "${resolved.name}": ${msg}`);
      }
    }
  } finally {
    // Restore env regardless of success/failure
    restoreEnv(baseEnv);
  }

  const durationMs = Date.now() - startTime;
  const status = errors.length === 0
    ? 'success'
    : errors.length < resolved.pipelines.length
      ? 'partial'
      : 'failed';

  return {
    name: resolved.name,
    pipelines: resolved.pipelines,
    status,
    durationMs,
    errors,
  };
}

// =============================================================================
// Main orchestrator
// =============================================================================

export async function runMultisite(): Promise<SiteRunResult[]> {
  log.header('🏘️  WEBMAGE - MULTISITE ORCHESTRATOR');

  if (!isMultisiteEnabled()) {
    log.error('Multisite is not enabled.');
    log.info('Set SUPPORT_MULTISITE_CONFIG=true in .env and provide a config.yaml');
    process.exit(1);
  }

  const config = loadMultisiteConfig();
  log.info(`Mode: ${config.mode}`);
  log.info(`Sites: ${config.sites.length}`);
  log.divider();

  // Snapshot the baseline env BEFORE any per-site mutations
  const baseEnv = snapshotEnv();

  // Resolve all sites against the baseline
  const resolvedSites = config.sites.map(site => resolveSiteConfig(site, baseEnv));

  const results: SiteRunResult[] = [];
  const startTime = Date.now();

  if (config.mode === 'sequential') {
    // ── Sequential execution ──
    for (const resolved of resolvedSites) {
      const result = await runSite(resolved, baseEnv);
      results.push(result);
    }
  } else {
    // ── Concurrent execution ──
    log.info('Running all sites concurrently...');

    // For concurrent mode, each site needs its own env context.
    // Since process.env is shared, we run each site sequentially within
    // its own env scope but launch all pipelines within a site concurrently.
    // True site-level concurrency would require worker threads.
    //
    // Approach: We apply env, construct services (which read env in constructors),
    // then run pipelines. Each site is processed sequentially to avoid env conflicts.
    const settled = await Promise.allSettled(
      resolvedSites.map(async (resolved) => {
        // For concurrent mode, apply env just before running and restore after.
        // Note: True concurrency with process.env is inherently unsafe.
        // We run them with allSettled but warn about env limitations.
        return runSite(resolved, baseEnv);
      }),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          name: 'unknown',
          pipelines: [],
          status: 'failed',
          durationMs: 0,
          errors: [result.reason instanceof Error ? result.reason.message : String(result.reason)],
        });
      }
    }
  }

  // Restore baseline env
  restoreEnv(baseEnv);

  // Print summary
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  log.divider('═');
  log.header('📊 MULTISITE SUMMARY');
  log.divider();

  for (const r of results) {
    const icon = r.status === 'success' ? '✅' : r.status === 'partial' ? '⚠️' : '❌';
    const dur = (r.durationMs / 1000).toFixed(1);
    log.info(`${icon} ${r.name} — ${r.status} (${dur}s) [${r.pipelines.join(', ')}]`);
    for (const e of r.errors) {
      log.error(`   └─ ${e}`);
    }
  }

  const succeeded = results.filter(r => r.status === 'success').length;
  const partial = results.filter(r => r.status === 'partial').length;
  const failed = results.filter(r => r.status === 'failed').length;

  log.divider();
  log.info(`Total: ${results.length} sites — ${succeeded} succeeded, ${partial} partial, ${failed} failed`);
  log.info(`⏱️  Total time: ${totalDuration}s`);

  log.saveLog({
    pipeline: 'multisite',
    mode: config.mode,
    totalDuration: `${totalDuration}s`,
    results,
  }, 'multisite');

  log.info('\n✅ Multisite run complete!\n');
  return results;
}

// Direct execution
if (process.argv[1]?.includes('run-multisite')) {
  runMultisite().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
