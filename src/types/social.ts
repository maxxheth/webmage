// =============================================================================
// Social / Offsite SEO Types
// =============================================================================

/**
 * Social media post for a specific platform
 */
export interface SocialPost {
  platform: 'twitter' | 'facebook' | 'linkedin' | 'instagram';
  text: string;
  hashtags: string[];
  url?: string;
  imageUrl?: string;
  scheduledAt?: string;
}

/**
 * Batch of social posts generated from a single piece of content
 */
export interface SocialPostBatch {
  sourcePostId: number;
  sourcePostTitle: string;
  sourcePostUrl: string;
  posts: SocialPost[];
  generatedAt: string;
}

/**
 * NAP citation package for a directory submission
 */
export interface CitationPackage {
  directoryName: string;
  directoryUrl: string;
  category: string;
  fields: {
    businessName: string;
    address: string;
    phone: string;
    website: string;
    description: string;
    hours?: string;
    categories?: string[];
    photos?: string[];
    socialProfiles?: Record<string, string>;
    [key: string]: unknown;
  };
  status: 'pending' | 'submitted' | 'verified';
  notes?: string;
}

/**
 * Outreach template for backlink building
 */
export interface OutreachTemplate {
  type: 'guest_post' | 'resource_page' | 'broken_link' | 'skyscraper';
  targetUrl: string;
  targetEmail?: string;
  subjectLine: string;
  emailBody: string;
  contentAngle: string;
  notes: string;
}

/**
 * Make webhook payload structure
 */
export interface MakeWebhookPayload {
  action: 'schedule_post';
  platform: SocialPost['platform'];
  text: string;
  url?: string;
  imageUrl?: string;
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}
