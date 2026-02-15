// =============================================================================
// Multisite Configuration Types
// =============================================================================

import type { PipelineConfig } from './wordpress.js';

/**
 * Which pipelines can be selected per site.
 */
export type PipelineName = 'onsite' | 'offsite' | 'haro';

/**
 * Execution mode for processing multiple sites.
 *
 * - `sequential` — process one site at a time (predictable resource usage).
 * - `concurrent` — process all sites in parallel (faster, higher resource usage).
 */
export type ExecutionMode = 'sequential' | 'concurrent';

/**
 * All recognised environment variable keys that can be set per-site.
 */
export type EnvKey =
  | 'OLLAMA_API_KEY'
  | 'OLLAMA_MODEL'
  | 'WP_BASE_URL'
  | 'WP_USERNAME'
  | 'WP_APP_PASSWORD'
  | 'ENABLE_IMAGES'
  | 'GOOGLE_AI_STUDIO_API_KEY'
  | 'GEMINI_IMAGE_MODEL'
  | 'MAKE_WEBHOOK_URL'
  | 'BUSINESS_NAME'
  | 'BUSINESS_PHONE'
  | 'BUSINESS_ADDRESS'
  | 'BUSINESS_WEBSITE'
  | 'BUSINESS_NICHE'
  | 'IMAP_HOST'
  | 'IMAP_PORT'
  | 'IMAP_USER'
  | 'IMAP_PASSWORD'
  | 'IMAP_MAILBOX'
  | 'HARO_MIN_RELEVANCE'
  | 'SCRAPY_URL';

/**
 * Top-level multisite configuration loaded from `config.yaml` / `config.yml`.
 */
export interface MultisiteConfig {
  /** Execution mode — sequential or concurrent. Defaults to `'sequential'`. */
  mode: ExecutionMode;
  /** Ordered list of site workflow entries to process. */
  sites: SiteEntry[];
}

/**
 * A single site/workflow entry in the multisite config.
 */
export interface SiteEntry {
  /** Human-readable name for this site (used in logs). */
  name: string;

  /**
   * When `true` (default), unset env keys inherit from the `.env` baseline.
   * When `false`, only the keys declared in `env` are used.
   */
  inherit?: boolean;

  /** Which pipelines to run for this site. Defaults to `['onsite', 'offsite']`. */
  pipelines?: PipelineName[];

  /**
   * Optional per-site input directory for the `InputLoader`.
   * Relative paths are resolved from `process.cwd()`.
   * If omitted, the global `input/` directory is used.
   */
  inputDir?: string;

  /** Per-site environment variable overrides. */
  env?: Partial<Record<EnvKey, string>>;

  /** Optional per-site pipeline config overrides (dryRun, batchSize, etc.). */
  pipelineConfig?: Partial<PipelineConfig>;
}

/**
 * Fully resolved site configuration after inheritance has been applied.
 * All env values are present; `inputDir` is an absolute path.
 */
export interface ResolvedSiteConfig {
  name: string;
  pipelines: PipelineName[];
  inputDir: string;
  env: Record<string, string>;
  pipelineConfig: Partial<PipelineConfig>;
}

/**
 * Result summary for a single site run.
 */
export interface SiteRunResult {
  name: string;
  pipelines: PipelineName[];
  status: 'success' | 'partial' | 'failed';
  durationMs: number;
  errors: string[];
}
