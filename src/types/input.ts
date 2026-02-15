// =============================================================================
// Input File Types
// =============================================================================

export type { InputMode, InputConfigFile, InputTeam, InputFileInfo } from '../utils/inputLoader.js';

/**
 * The set of recognized input filenames for the onsite team,
 * mapped to the pipeline step they feed into.
 */
export const ONSITE_INPUT_FILES = {
  /** Pre-researched keywords — feeds `keywordResearchStep` */
  KEYWORDS_TXT: 'keywords.txt',
  KEYWORDS_JSON: 'keywords.json',

  /** Cached crawl results — feeds `triggerCrawlStep` */
  CRAWL_DATA_JSON: 'crawl-data.json',

  /** Content briefs — feeds `siloPlanStep` */
  CONTENT_BRIEFS_JSON: 'content-briefs.json',
  CONTENT_BRIEFS_MD: 'content-briefs.md',
} as const;

/**
 * The set of recognized input filenames for the offsite team,
 * mapped to the pipeline step they feed into.
 */
export const OFFSITE_INPUT_FILES = {
  /** Social media profile URLs — feeds `generateSocialPostsStep` */
  SOCIAL_MEDIA_PROFILES_TXT: 'social-media-profiles.txt',

  /** Outreach target URLs — feeds `generateOutreachStep` */
  OUTREACH_TARGETS_TXT: 'outreach-targets.txt',

  /** Content topics for outreach — feeds `generateOutreachStep` */
  CONTENT_TOPICS_TXT: 'content-topics.txt',

  /** Citation overrides — feeds `generateCitationPackagesStep` */
  CITATION_OVERRIDES_JSON: 'citation-overrides.json',

  /** Offline HARO emails — feeds `fetchEmailsStep` */
  HARO_EMAILS_JSON: 'haro-emails.json',
} as const;
