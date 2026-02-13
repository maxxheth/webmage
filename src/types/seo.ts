// =============================================================================
// SEO Types (Onsite Team)
// =============================================================================

/**
 * Page data extracted by Scrapy crawler
 */
export interface CrawledPage {
  url: string;
  status_code: number;
  title: string;
  meta_description: string;
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
  internal_links: string[];
  external_links: string[];
  images: Array<{
    src: string;
    alt: string;
    missing_alt: boolean;
  }>;
  word_count: number;
  schema_types: string[];
  canonical: string;
  og_tags: Record<string, string>;
  response_time_ms: number;
}

/**
 * Full site crawl result from Scrapy microservice
 */
export interface CrawlResult {
  domain: string;
  crawled_at: string;
  total_pages: number;
  pages: CrawledPage[];
  errors: Array<{
    url: string;
    status_code: number;
    error: string;
  }>;
}

/**
 * Site audit produced by the site audit chain
 */
export interface SiteAudit {
  domain: string;
  overallScore: number;
  issues: AuditIssue[];
  opportunities: AuditOpportunity[];
  existingContent: ContentInventoryItem[];
}

export interface AuditIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'technical' | 'content' | 'meta' | 'performance' | 'links';
  description: string;
  affectedPages: string[];
  recommendation: string;
}

export interface AuditOpportunity {
  type: 'missing_content' | 'thin_content' | 'missing_meta' | 'internal_linking' | 'schema';
  description: string;
  estimatedImpact: 'high' | 'medium' | 'low';
  pages: string[];
}

export interface ContentInventoryItem {
  url: string;
  title: string;
  wordCount: number;
  hasMetaDescription: boolean;
  hasFeaturedImage: boolean;
  categories: string[];
  internalLinksIn: number;
  internalLinksOut: number;
}

/**
 * Keyword cluster from research chain
 */
export interface KeywordCluster {
  primaryKeyword: string;
  relatedKeywords: string[];
  searchIntent: 'informational' | 'transactional' | 'navigational' | 'commercial';
  estimatedDifficulty: 'easy' | 'medium' | 'hard';
  suggestedContentType: 'pillar' | 'supporting' | 'page';
}

/**
 * Silo architecture plan
 */
export interface SiloPlan {
  name: string;
  description: string;
  pillar: PillarPlanItem;
  supportingPosts: SupportingPlanItem[];
  categoryName: string;
  tags: string[];
}

export interface PillarPlanItem {
  title: string;
  targetKeyword: string;
  outline: string[];
  estimatedWordCount: number;
}

export interface SupportingPlanItem {
  title: string;
  targetKeyword: string;
  linksBackToPillar: boolean;
  estimatedWordCount: number;
}

/**
 * Generated pillar post content
 */
export interface GeneratedPillarPost {
  title: string;
  content: string;
  excerpt: string;
  slimSeoMeta: {
    title: string;
    description: string;
  };
  categoryName: string;
  tags: string[];
  internalLinkPlaceholders: string[];
  faqSchema: Array<{ question: string; answer: string }>;
}

/**
 * Generated supporting post content
 */
export interface GeneratedSupportingPost {
  title: string;
  content: string;
  excerpt: string;
  slimSeoMeta: {
    title: string;
    description: string;
  };
  pillarLinkAnchor: string;
  tags: string[];
  faqSchema: Array<{ question: string; answer: string }>;
}
