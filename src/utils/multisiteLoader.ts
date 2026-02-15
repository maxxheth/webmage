import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type {
  MultisiteConfig,
  SiteEntry,
  ResolvedSiteConfig,
  ExecutionMode,
  PipelineName,
} from '../types/multisite.js';

// =============================================================================
// Multisite Config Loader
// =============================================================================

const VALID_MODES: ExecutionMode[] = ['sequential', 'concurrent'];
const VALID_PIPELINES: PipelineName[] = ['onsite', 'offsite', 'haro'];

/**
 * Checks whether multisite config is enabled and a config file exists.
 */
export function isMultisiteEnabled(): boolean {
  return (
    process.env.SUPPORT_MULTISITE_CONFIG === 'true' &&
    findConfigFile() !== null
  );
}

/**
 * Locate `config.yaml` or `config.yml` in the working directory.
 * Returns the absolute path or `null` if neither exists.
 */
export function findConfigFile(cwd?: string): string | null {
  const base = cwd ?? process.cwd();
  for (const name of ['config.yaml', 'config.yml']) {
    const candidate = path.join(base, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Load and validate a multisite config from YAML.
 *
 * @param configPath — explicit path, or auto-detected via `findConfigFile()`.
 * @throws if the file is missing, unparseable, or structurally invalid.
 */
export function loadMultisiteConfig(configPath?: string): MultisiteConfig {
  const filePath = configPath ?? findConfigFile();
  if (!filePath) {
    throw new Error(
      'No config.yaml or config.yml found in the working directory.'
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML structure in ${filePath}`);
  }

  // --- mode ---
  const mode = (parsed.mode as string) ?? 'sequential';
  if (!VALID_MODES.includes(mode as ExecutionMode)) {
    throw new Error(
      `Invalid mode "${mode}" in ${filePath}. Must be one of: ${VALID_MODES.join(', ')}`
    );
  }

  // --- sites ---
  const rawSites = parsed.sites;
  if (!Array.isArray(rawSites) || rawSites.length === 0) {
    throw new Error(
      `"sites" must be a non-empty array in ${filePath}`
    );
  }

  const sites: SiteEntry[] = rawSites.map((raw: unknown, i: number) => {
    const s = raw as Record<string, unknown>;
    if (!s.name || typeof s.name !== 'string') {
      throw new Error(`Site at index ${i} is missing a "name" string.`);
    }

    // Validate pipelines
    const pipelines = (s.pipelines as string[] | undefined) ?? ['onsite', 'offsite'];
    for (const p of pipelines) {
      if (!VALID_PIPELINES.includes(p as PipelineName)) {
        throw new Error(
          `Site "${s.name}": invalid pipeline "${p}". Must be one of: ${VALID_PIPELINES.join(', ')}`
        );
      }
    }

    return {
      name: s.name as string,
      inherit: s.inherit !== false, // default true
      pipelines: pipelines as PipelineName[],
      inputDir: s.inputDir as string | undefined,
      env: (s.env as Record<string, string> | undefined) ?? {},
      pipelineConfig: (s.pipelineConfig as Record<string, unknown> | undefined) ?? {},
    } satisfies SiteEntry;
  });

  return { mode: mode as ExecutionMode, sites };
}

// =============================================================================
// Site Resolution (inheritance)
// =============================================================================

/**
 * Resolve a `SiteEntry` against the base environment (typically the `.env`
 * snapshot taken at startup).
 *
 * - If `inherit: true`, the site's `env` is merged ON TOP of `baseEnv`.
 * - If `inherit: false`, only the site's own `env` is used.
 */
export function resolveSiteConfig(
  site: SiteEntry,
  baseEnv: Record<string, string | undefined>,
): ResolvedSiteConfig {
  let resolvedEnv: Record<string, string>;

  if (site.inherit !== false) {
    // Start with base, overlay site-specific values
    resolvedEnv = { ...filterDefined(baseEnv), ...(site.env ?? {}) };
  } else {
    resolvedEnv = { ...(site.env ?? {}) };
  }

  // Resolve inputDir to absolute path
  const inputDir = site.inputDir
    ? path.resolve(process.cwd(), site.inputDir)
    : path.join(process.cwd(), 'input');

  return {
    name: site.name,
    pipelines: site.pipelines ?? ['onsite', 'offsite'],
    inputDir,
    env: resolvedEnv,
    pipelineConfig: site.pipelineConfig ?? {},
  };
}

// =============================================================================
// Environment Mutation Helpers
// =============================================================================

/**
 * Take a snapshot of `process.env` at this moment.
 */
export function snapshotEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

/**
 * Apply a resolved site's environment variables into `process.env`.
 * Returns a restore function that undoes the changes.
 */
export function applySiteEnv(
  resolved: ResolvedSiteConfig,
): () => void {
  const snapshot = snapshotEnv();

  for (const [key, value] of Object.entries(resolved.env)) {
    process.env[key] = value;
  }

  return () => restoreEnv(snapshot);
}

/**
 * Restore `process.env` to a previous snapshot.
 */
export function restoreEnv(
  snapshot: Record<string, string | undefined>,
): void {
  // Remove any keys that weren't in the snapshot
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  // Restore original values
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Filter out `undefined` values from a Record.
 */
function filterDefined(
  obj: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}
