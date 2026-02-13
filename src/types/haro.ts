// =============================================================================
// HARO / Journalist Outreach Types
// =============================================================================

/**
 * Raw email parsed from a HARO-style journalist query service
 */
export interface HaroEmail {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  textBody: string;
  htmlBody: string;
  platform: HaroPlatform;
}

export type HaroPlatform =
  | 'qwoted'
  | 'featured'
  | 'terkel'
  | 'sourcebottle'
  | 'journorequests'
  | 'helpab2bwriter'
  | 'unknown';

/**
 * Structured query extracted from a HARO email
 */
export interface HaroQuery {
  journalistName: string;
  outlet: string;
  topic: string;
  requirements: string[];
  deadline: string;
  sourceEmail: string;
  platform: HaroPlatform;
  rawSubject: string;
  rawEmailUid: number;
}

/**
 * Relevance score result for a HARO query
 */
export interface HaroRelevanceScore {
  query: HaroQuery;
  score: number;
  reasoning: string;
  matchedExpertise: string[];
  suggestedAngle: string;
}

/**
 * Draft response ready for human review
 */
export interface HaroDraftResponse {
  query: HaroQuery;
  relevanceScore: number;
  subjectLine: string;
  responseBody: string;
  expertQuote: string;
  credentials: string;
  bio: string;
  contactInfo: string;
  draftedAt: string;
  status: 'drafted' | 'reviewed' | 'sent' | 'skipped';
}

/**
 * IMAP connection configuration
 */
export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  tls: boolean;
}
