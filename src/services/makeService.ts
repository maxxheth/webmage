import axios from 'axios';
import type { SocialPost, MakeWebhookPayload } from '../types/social.js';

/**
 * Service for pushing social media posts to Buffer via Make (Integromat) webhooks.
 *
 * Buffer doesn't have a public API, so we use a Make scenario as a bridge:
 * 1. Webmage sends a JSON payload to a Make webhook
 * 2. Make scenario processes it and schedules it in Buffer
 */
export class MakeService {
  private webhookUrl: string;

  constructor() {
    const url = process.env.MAKE_WEBHOOK_URL;
    if (!url) {
      throw new Error('MAKE_WEBHOOK_URL environment variable is required');
    }
    this.webhookUrl = url;
  }

  /**
   * Push a social media post to Buffer via Make webhook
   */
  async publishToBuffer(post: SocialPost): Promise<void> {
    const payload: MakeWebhookPayload = {
      action: 'schedule_post',
      platform: post.platform,
      text: this.formatPostText(post),
      url: post.url,
      imageUrl: post.imageUrl,
      scheduledAt: post.scheduledAt,
      metadata: {
        hashtags: post.hashtags,
        generatedBy: 'webmage',
        generatedAt: new Date().toISOString(),
      },
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Make webhook failed: [${error.response?.status}] ${error.response?.data?.message || error.message}`);
      }
      throw new Error(`Make webhook failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publish a batch of posts across platforms
   */
  async publishBatch(posts: SocialPost[]): Promise<Array<{ platform: string; success: boolean; error?: string }>> {
    const results: Array<{ platform: string; success: boolean; error?: string }> = [];

    for (const post of posts) {
      try {
        await this.publishToBuffer(post);
        results.push({ platform: post.platform, success: true });
      } catch (error) {
        results.push({
          platform: post.platform,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Test the Make webhook by sending a ping payload
   */
  async testWebhook(): Promise<boolean> {
    try {
      await axios.post(this.webhookUrl, {
        action: 'ping',
        source: 'webmage',
        timestamp: new Date().toISOString(),
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      console.log('  ✓ Make webhook responded successfully');
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Make webhooks return 200 even for test pings if they're configured
        if (error.response?.status === 200) return true;
        console.error(`  ❌ Make webhook test failed: [${error.response?.status}] ${error.message}`);
      } else {
        console.error('  ❌ Make webhook test failed:', error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  }

  /**
   * Format post text with hashtags appended
   */
  private formatPostText(post: SocialPost): string {
    const hashtags = post.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
    if (hashtags) {
      return `${post.text}\n\n${hashtags}`;
    }
    return post.text;
  }
}
