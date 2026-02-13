import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { HaroEmail, HaroPlatform, ImapConfig } from '../types/haro.js';

/**
 * Platform detection patterns — maps sender domains/subjects to platforms
 */
const PLATFORM_PATTERNS: Array<{ pattern: RegExp; platform: HaroPlatform }> = [
  { pattern: /qwoted/i, platform: 'qwoted' },
  { pattern: /featured\.com/i, platform: 'featured' },
  { pattern: /terkel/i, platform: 'terkel' },
  { pattern: /sourcebottle/i, platform: 'sourcebottle' },
  { pattern: /journo\s*requests/i, platform: 'journorequests' },
  { pattern: /help\s*a\s*b2b\s*writer/i, platform: 'helpab2bwriter' },
];

/**
 * IMAP email monitoring service for HARO-style journalist query platforms.
 *
 * Connects to a dedicated inbox, fetches unread messages from journalist
 * query services, parses them, and returns structured HaroEmail objects.
 */
export class ImapService {
  private client: ImapFlow;
  private config: ImapConfig;
  private connected = false;

  constructor() {
    this.config = {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASSWORD || '',
      mailbox: process.env.IMAP_MAILBOX || 'INBOX',
      tls: true,
    };

    if (!this.config.user || !this.config.password) {
      throw new Error('IMAP_USER and IMAP_PASSWORD environment variables are required');
    }

    this.client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false,
    });
  }

  /**
   * Connect to the IMAP server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.client.connect();
      this.connected = true;
      console.log(`  ✓ IMAP connected to ${this.config.host} as ${this.config.user}`);
    } catch (error) {
      throw new Error(`IMAP connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch all unread/unseen messages from the configured mailbox
   */
  async fetchUnread(): Promise<HaroEmail[]> {
    if (!this.connected) {
      await this.connect();
    }

    const emails: HaroEmail[] = [];

    const lock = await this.client.getMailboxLock(this.config.mailbox);
    try {
      // Search for unseen messages — returns false | number[]
      const searchResult = await this.client.search({ seen: false });
      const uids = searchResult === false ? [] : searchResult;

      if (uids.length === 0) {
        console.log('  ⊘ No unread messages found');
        return emails;
      }

      console.log(`  → Found ${uids.length} unread message(s)`);

      // Fetch each message
      for await (const message of this.client.fetch(uids, {
        source: true,
        uid: true,
      })) {
        try {
          if (!message.source) continue;
          const parsed: ParsedMail = await simpleParser(message.source) as ParsedMail;
          const platform = this.detectPlatform(parsed);

          emails.push({
            uid: message.uid,
            from: this.extractFrom(parsed),
            subject: parsed.subject || '(no subject)',
            date: parsed.date || new Date(),
            textBody: parsed.text || '',
            htmlBody: typeof parsed.html === 'string' ? parsed.html : '',
            platform,
          });
        } catch (parseError) {
          console.warn(`  ⚠ Failed to parse message UID ${message.uid}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      }
    } finally {
      lock.release();
    }

    // Filter to only HARO-related emails
    const haroEmails = emails.filter(e => e.platform !== 'unknown');
    console.log(`  ✓ ${haroEmails.length} HARO-related email(s) out of ${emails.length} total`);

    return haroEmails;
  }

  /**
   * Mark a message as processed (seen/read)
   */
  async markProcessed(uid: number): Promise<void> {
    const lock = await this.client.getMailboxLock(this.config.mailbox);
    try {
      await this.client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  }

  /**
   * Disconnect from the IMAP server
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.logout();
      this.connected = false;
      console.log('  ✓ IMAP disconnected');
    }
  }

  /**
   * Detect which HARO platform sent this email
   */
  private detectPlatform(parsed: ParsedMail): HaroPlatform {
    const fromAddress = this.extractFrom(parsed);
    const subject = parsed.subject || '';
    const combined = `${fromAddress} ${subject}`;

    for (const { pattern, platform } of PLATFORM_PATTERNS) {
      if (pattern.test(combined)) {
        return platform;
      }
    }

    return 'unknown';
  }

  /**
   * Extract the from address from a parsed email
   */
  private extractFrom(parsed: ParsedMail): string {
    if (parsed.from?.value?.[0]?.address) {
      return parsed.from.value[0].address;
    }
    return parsed.from?.text || 'unknown';
  }

  /**
   * Test the IMAP connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      console.log('  ✓ IMAP connection test passed');
      await this.disconnect();
      return true;
    } catch (error) {
      console.error(`  ❌ IMAP connection test failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
