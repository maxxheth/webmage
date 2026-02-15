import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Input File Loader
// =============================================================================

/**
 * Mode controlling how user-provided input data interacts with automated data.
 *
 * - `replace`    → Skip the automated step entirely; use only user-provided data.
 * - `supplement` → Merge user-provided data with automated output (default).
 */
export type InputMode = 'replace' | 'supplement';

/**
 * Per-file override declared in `_config.json` inside an input directory.
 *
 * Example `input/onsite/_config.json`:
 * ```json
 * { "keywords.txt": "replace", "content-briefs.json": "supplement" }
 * ```
 */
export type InputConfigFile = Record<string, InputMode>;

export type InputTeam = 'onsite' | 'offsite';

/**
 * Metadata about a discovered input file.
 */
export interface InputFileInfo {
  filename: string;
  fullPath: string;
  mode: InputMode;
}

/**
 * Scans `input/onsite/` and `input/offsite/` directories for user-provided
 * raw data files and exposes helpers to read them.
 *
 * Naming convention for mode detection:
 *   - `keywords.replace.txt`  → mode = 'replace'
 *   - `keywords.txt`          → mode = 'supplement' (default)
 *
 * A `_config.json` file in the team directory can explicitly override modes.
 */
export class InputLoader {
  private baseDir: string;
  private configCache = new Map<InputTeam, InputConfigFile | null>();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), 'input');
  }

  // ---------------------------------------------------------------------------
  // Directory helpers
  // ---------------------------------------------------------------------------

  /** Resolve full path to a team's input directory. */
  private teamDir(team: InputTeam): string {
    return path.join(this.baseDir, team);
  }

  /** Resolve full path to a file inside a team's input directory. */
  private filePath(team: InputTeam, filename: string): string {
    return path.join(this.teamDir(team), filename);
  }

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  /**
   * Check whether a specific input file exists.
   * Also checks for the `.replace.` variant if the exact name isn't found.
   */
  exists(team: InputTeam, filename: string): boolean {
    return this.resolve(team, filename) !== null;
  }

  /**
   * Resolve the actual filename on disk.  Given `keywords.txt`, this checks
   * for both `keywords.txt` and `keywords.replace.txt`.
   *
   * Returns the matched filename or `null`.
   */
  resolve(team: InputTeam, filename: string): string | null {
    // Check exact name first
    if (fs.existsSync(this.filePath(team, filename))) return filename;

    // Check .replace. variant
    const replaceVariant = this.toReplaceFilename(filename);
    if (fs.existsSync(this.filePath(team, replaceVariant))) return replaceVariant;

    return null;
  }

  // ---------------------------------------------------------------------------
  // Mode detection
  // ---------------------------------------------------------------------------

  /**
   * Determine the mode for a given file.
   *
   * Priority:
   * 1. `_config.json` explicit override
   * 2. `.replace.` infix in the resolved filename on disk
   * 3. Default: `'supplement'`
   */
  getMode(team: InputTeam, filename: string): InputMode {
    // Check _config.json first
    const config = this.loadConfig(team);
    if (config) {
      // Check canonical name and resolved name
      if (config[filename]) return config[filename];
      const resolved = this.resolve(team, filename);
      if (resolved && config[resolved]) return config[resolved];
    }

    // Check filename convention
    const resolved = this.resolve(team, filename);
    if (resolved && resolved.includes('.replace.')) return 'replace';

    return 'supplement';
  }

  // ---------------------------------------------------------------------------
  // File readers
  // ---------------------------------------------------------------------------

  /**
   * Read a text file and return non-empty, trimmed lines.
   */
  readText(team: InputTeam, filename: string): string[] {
    const resolved = this.resolve(team, filename);
    if (!resolved) return [];

    const raw = fs.readFileSync(this.filePath(team, resolved), 'utf-8');
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Read a text file and return lines grouped by blank-line-separated blocks.
   * Useful for parsing keyword clusters from a plain-text file.
   */
  readTextBlocks(team: InputTeam, filename: string): string[][] {
    const resolved = this.resolve(team, filename);
    if (!resolved) return [];

    const raw = fs.readFileSync(this.filePath(team, resolved), 'utf-8');
    const blocks: string[][] = [];
    let current: string[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        if (current.length > 0) {
          blocks.push(current);
          current = [];
        }
      } else {
        current.push(trimmed);
      }
    }
    if (current.length > 0) blocks.push(current);

    return blocks;
  }

  /**
   * Read and parse a JSON file. Returns `null` if the file doesn't exist
   * or cannot be parsed (logs a warning on parse failure).
   */
  readJson<T = unknown>(team: InputTeam, filename: string): T | null {
    const resolved = this.resolve(team, filename);
    if (!resolved) return null;

    const fullPath = this.filePath(team, resolved);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(
        `  ⚠ Failed to parse input file ${fullPath}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  /**
   * Read a CSV file and return an array of rows (each row is an array of
   * trimmed cell values). Skips empty rows.
   */
  readCsv(team: InputTeam, filename: string): string[][] {
    const lines = this.readText(team, filename);
    return lines.map(line =>
      line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    );
  }

  /**
   * Read raw file contents as a string. Returns `null` if file doesn't exist.
   */
  readRaw(team: InputTeam, filename: string): string | null {
    const resolved = this.resolve(team, filename);
    if (!resolved) return null;
    return fs.readFileSync(this.filePath(team, resolved), 'utf-8');
  }

  // ---------------------------------------------------------------------------
  // Scanning / discovery
  // ---------------------------------------------------------------------------

  /**
   * Scan a team's input directory and return metadata for every discovered file.
   * Returns an empty array if the directory doesn't exist.
   */
  scan(team: InputTeam): InputFileInfo[] {
    const dir = this.teamDir(team);
    if (!fs.existsSync(dir)) return [];

    return fs
      .readdirSync(dir)
      .filter(f => !f.startsWith('.') && f !== '_config.json')
      .map(filename => ({
        filename,
        fullPath: path.join(dir, filename),
        mode: this.getMode(team, filename),
      }));
  }

  /**
   * Log all discovered input files for a team.
   */
  logDiscoveredFiles(team: InputTeam): void {
    const files = this.scan(team);
    if (files.length === 0) {
      console.log(`  📂 No input files in input/${team}/`);
      return;
    }

    console.log(`  📂 Discovered ${files.length} input file(s) in input/${team}/:`);
    for (const file of files) {
      console.log(`    • ${file.filename} [${file.mode}]`);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Load the `_config.json` override file for a team (cached).
   */
  private loadConfig(team: InputTeam): InputConfigFile | null {
    if (this.configCache.has(team)) return this.configCache.get(team)!;

    const configPath = path.join(this.teamDir(team), '_config.json');
    if (!fs.existsSync(configPath)) {
      this.configCache.set(team, null);
      return null;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as InputConfigFile;
      this.configCache.set(team, config);
      return config;
    } catch {
      console.warn(`  ⚠ Failed to parse input/${team}/_config.json — ignoring`);
      this.configCache.set(team, null);
      return null;
    }
  }

  /**
   * Convert `keywords.txt` → `keywords.replace.txt`.
   */
  private toReplaceFilename(filename: string): string {
    const dotIdx = filename.indexOf('.');
    if (dotIdx === -1) return `${filename}.replace`;
    return `${filename.substring(0, dotIdx)}.replace${filename.substring(dotIdx)}`;
  }
}
