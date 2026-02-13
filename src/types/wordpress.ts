// =============================================================================
// WordPress Types
// =============================================================================

/**
 * WordPress Post interface (covers posts, pages, custom post types)
 */
export interface WPPost {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: 'publish' | 'draft' | 'pending' | 'private';
  type: string;
  link: string;
  title: {
    rendered: string;
    raw?: string;
  };
  content: {
    rendered: string;
    protected: boolean;
    raw?: string;
  };
  excerpt: {
    rendered: string;
    protected: boolean;
    raw?: string;
  };
  featured_media: number;
  categories?: number[];
  tags?: number[];
  acf?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  _links?: Record<string, unknown>;
}

/**
 * WordPress Media upload response
 */
export interface WPMedia {
  id: number;
  date: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  source_url: string;
  media_type: string;
  mime_type: string;
  alt_text?: string;
}

/**
 * WordPress Category
 */
export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  count: number;
}

/**
 * WordPress Tag
 */
export interface WPTag {
  id: number;
  name: string;
  slug: string;
  count: number;
}

/**
 * Slim SEO meta fields (stored as serialized array in slim_seo post_meta)
 */
export interface SlimSeoMeta {
  title?: string;
  description?: string;
  facebook_image?: string;
  twitter_image?: string;
  noindex?: boolean;
  canonical?: string;
}

/**
 * Payload for creating a new WordPress post
 */
export interface CreatePostPayload {
  title: string;
  content: string;
  excerpt?: string;
  status: 'publish' | 'draft';
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  meta?: Record<string, unknown>;
}

/**
 * Payload for updating an existing WordPress post
 */
export interface UpdatePostPayload {
  title?: string;
  content?: string;
  excerpt?: string;
  status?: 'publish' | 'draft' | 'pending' | 'private';
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  meta?: Record<string, unknown>;
}

/**
 * Pipeline configuration options
 */
export interface PipelineConfig {
  dryRun: boolean;
  skipExisting: boolean;
  batchSize: number;
  delayBetweenRequests: number;
  maxRetries: number;
  retryDelay: number;
  force?: boolean;
  debug?: boolean;
  targetSilo?: string;
}

/**
 * Pipeline processing result for a single item
 */
export interface ProcessingResult {
  itemId: number;
  itemTitle: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
  payload?: Record<string, unknown>;
}
