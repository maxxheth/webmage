import * as fs from 'fs';
import * as path from 'path';

export type TeamName = 'ONSITE' | 'OFFSITE' | 'VILLAGE' | 'HARO' | 'MULTISITE';

/**
 * Team-prefixed logger for consistent output across concurrent pipelines
 */
export class Logger {
  private team: TeamName;
  private logLines: string[] = [];

  constructor(team: TeamName) {
    this.team = team;
  }

  info(message: string): void {
    const line = `[${this.team}] ${message}`;
    this.logLines.push(line);
    console.log(line);
  }

  success(message: string): void {
    const line = `[${this.team}] ✓ ${message}`;
    this.logLines.push(line);
    console.log(line);
  }

  warn(message: string): void {
    const line = `[${this.team}] ⚠ ${message}`;
    this.logLines.push(line);
    console.warn(line);
  }

  error(message: string): void {
    const line = `[${this.team}] ✗ ${message}`;
    this.logLines.push(line);
    console.error(line);
  }

  divider(char = '─', length = 60): void {
    const line = char.repeat(length);
    this.logLines.push(line);
    console.log(line);
  }

  header(title: string): void {
    this.divider('═');
    this.info(title);
    this.divider('═');
  }

  /**
   * Save accumulated log to a JSON file
   */
  saveLog(data: Record<string, unknown>, prefix: string): string {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `${prefix}-${timestamp}.json`);

    const logData = {
      timestamp: new Date().toISOString(),
      team: this.team,
      ...data,
      rawLog: this.logLines,
    };

    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    this.info(`📋 Results saved to: ${logFile}`);
    return logFile;
  }
}

/**
 * Print a formatted summary table
 */
export function printSummary(
  title: string,
  results: Array<{ success: boolean; skipped?: boolean }>
): void {
  const successful = results.filter(r => r.success && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  const failed = results.filter(r => !r.success && !r.skipped);

  console.log('\n' + '═'.repeat(60));
  console.log(title);
  console.log('═'.repeat(60));
  console.log(`  ✓ Successfully processed: ${successful.length}`);
  console.log(`  ⊘ Skipped (existing):     ${skipped.length}`);
  console.log(`  ✗ Failed:                 ${failed.length}`);
  console.log('─'.repeat(60));
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
