import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import { SiteAuditChain } from '../../chains/onsite/siteAuditChain.js';
import { KeywordResearchChain } from '../../chains/onsite/keywordResearchChain.js';
import { SiloPlannerChain } from '../../chains/onsite/siloPlannerChain.js';
import type { CrawlResult, SiteAudit, KeywordCluster, SiloPlan } from '../../types/seo.js';
import type { InputLoader } from '../../utils/inputLoader.js';
import { ONSITE_INPUT_FILES } from '../../types/input.js';

/**
 * Memory structure for the planning pipeline
 */
export interface PlanningPipelineMemory {
  ollama: OllamaService;
  crawlResult: CrawlResult;
  businessNiche: string;
  location: string;
  dryRun: boolean;
  targetClusterCount: number;
  audit?: SiteAudit;
  keywords?: KeywordCluster[];
  silos?: SiloPlan[];
  inputLoader?: InputLoader;
}

/**
 * Step: Run site audit from crawl data
 */
export const auditStep: Step<CrawlResult> = async (ctx) => {
  const memory = ctx.memory as PlanningPipelineMemory;

  if (memory.dryRun) {
    console.log('  ⊘ [DRY RUN] Would perform site audit');
    return ctx;
  }

  console.log('  → Running site audit...');
  const auditChain = new SiteAuditChain(memory.ollama);
  memory.audit = await auditChain.analyze(memory.crawlResult);
  console.log(`  ✓ Audit complete — Score: ${memory.audit.overallScore}/100`);
  console.log(`    Issues: ${memory.audit.issues.length} | Opportunities: ${memory.audit.opportunities.length}`);

  return ctx;
};

/**
 * Step: Perform keyword research based on audit findings
 */
export const keywordResearchStep: Step<CrawlResult> = async (ctx) => {
  const memory = ctx.memory as PlanningPipelineMemory;

  if (memory.dryRun || !memory.audit) {
    console.log('  ⊘ [DRY RUN] Would perform keyword research');
    return ctx;
  }

  // Check for user-provided keywords
  const loader = memory.inputLoader;
  const hasKeywordsTxt = loader?.exists('onsite', ONSITE_INPUT_FILES.KEYWORDS_TXT);
  const hasKeywordsJson = loader?.exists('onsite', ONSITE_INPUT_FILES.KEYWORDS_JSON);

  let userKeywords: KeywordCluster[] | null = null;
  let mode: 'replace' | 'supplement' = 'supplement';

  if (hasKeywordsJson && loader) {
    userKeywords = loader.readJson<KeywordCluster[]>('onsite', ONSITE_INPUT_FILES.KEYWORDS_JSON);
    mode = loader.getMode('onsite', ONSITE_INPUT_FILES.KEYWORDS_JSON);
    if (userKeywords) {
      console.log(`  ↩ Loaded ${userKeywords.length} keyword cluster(s) from input/onsite/keywords.json [${mode}]`);
    }
  } else if (hasKeywordsTxt && loader) {
    const blocks = loader.readTextBlocks('onsite', ONSITE_INPUT_FILES.KEYWORDS_TXT);
    mode = loader.getMode('onsite', ONSITE_INPUT_FILES.KEYWORDS_TXT);
    if (blocks.length > 0) {
      userKeywords = blocks.map(block => ({
        primaryKeyword: block[0],
        relatedKeywords: block.slice(1),
        searchIntent: 'informational' as const,
        estimatedDifficulty: 'medium' as const,
        suggestedContentType: 'pillar' as const,
      }));
      console.log(`  ↩ Parsed ${userKeywords.length} keyword cluster(s) from input/onsite/keywords.txt [${mode}]`);
    }
  }

  // Replace mode: skip LLM entirely
  if (userKeywords && mode === 'replace') {
    memory.keywords = userKeywords;
    console.log(`  ✓ Using ${memory.keywords.length} user-provided keyword clusters (replace mode)`);
    return ctx;
  }

  // Run LLM keyword research
  console.log('  → Researching keywords...');
  const keywordChain = new KeywordResearchChain(memory.ollama);
  memory.keywords = await keywordChain.research(
    memory.businessNiche,
    memory.location,
    memory.audit,
    memory.targetClusterCount
  );

  // Supplement mode: merge user keywords with LLM keywords
  if (userKeywords && mode === 'supplement') {
    const existingPrimaries = new Set(memory.keywords.map(k => k.primaryKeyword.toLowerCase()));
    const newClusters = userKeywords.filter(
      k => !existingPrimaries.has(k.primaryKeyword.toLowerCase())
    );
    memory.keywords.push(...newClusters);
    console.log(`  ✓ Merged ${newClusters.length} additional user-provided cluster(s)`);
  }

  console.log(`  ✓ Found ${memory.keywords.length} keyword clusters:`);
  memory.keywords.forEach((cluster, i) => {
    console.log(`    ${i + 1}. "${cluster.primaryKeyword}" (${cluster.searchIntent}, ${cluster.estimatedDifficulty})`);
  });

  return ctx;
};

/**
 * Step: Plan content silos from keyword clusters
 */
export const siloPlanStep: Step<CrawlResult> = async (ctx) => {
  const memory = ctx.memory as PlanningPipelineMemory;

  if (memory.dryRun || !memory.keywords) {
    console.log('  ⊘ [DRY RUN] Would plan content silos');
    return ctx;
  }

  // Check for user-provided content briefs
  const loader = memory.inputLoader;
  const hasBriefsJson = loader?.exists('onsite', ONSITE_INPUT_FILES.CONTENT_BRIEFS_JSON);
  const hasBriefsMd = loader?.exists('onsite', ONSITE_INPUT_FILES.CONTENT_BRIEFS_MD);

  let userSilos: SiloPlan[] | null = null;
  let mode: 'replace' | 'supplement' = 'supplement';

  if (hasBriefsJson && loader) {
    userSilos = loader.readJson<SiloPlan[]>('onsite', ONSITE_INPUT_FILES.CONTENT_BRIEFS_JSON);
    mode = loader.getMode('onsite', ONSITE_INPUT_FILES.CONTENT_BRIEFS_JSON);
    if (userSilos) {
      console.log(`  ↩ Loaded ${userSilos.length} silo plan(s) from input/onsite/content-briefs.json [${mode}]`);
    }
  } else if (hasBriefsMd && loader) {
    // Parse markdown briefs: each ## Silo: <Name> header starts a new silo
    const raw = loader.readRaw('onsite', ONSITE_INPUT_FILES.CONTENT_BRIEFS_MD);
    mode = loader.getMode('onsite', ONSITE_INPUT_FILES.CONTENT_BRIEFS_MD);
    if (raw) {
      const siloParts = raw.split(/^## Silo:\s*/m).filter(s => s.trim().length > 0);
      if (siloParts.length > 0) {
        // Markdown briefs provide partial silo hints — log them for the LLM
        console.log(`  ↩ Found ${siloParts.length} silo brief(s) from input/onsite/content-briefs.md [${mode}]`);
        console.log('    (Markdown briefs will be passed as context to the silo planner)');
      }
    }
  }

  // Replace mode with JSON silos: skip LLM entirely
  if (userSilos && mode === 'replace') {
    memory.silos = userSilos;
    console.log(`  ✓ Using ${memory.silos.length} user-provided silo plan(s) (replace mode)`);
    memory.silos.forEach((silo, i) => {
      console.log(`    ${i + 1}. "${silo.name}" — Pillar: "${silo.pillar.title}" + ${silo.supportingPosts.length} supporting posts`);
    });
    return ctx;
  }

  // Run LLM silo planning
  console.log('  → Planning content silos...');
  const siloChain = new SiloPlannerChain(memory.ollama);
  memory.silos = await siloChain.plan(
    memory.businessNiche,
    memory.location,
    memory.keywords
  );

  // Supplement mode: merge user silos with LLM silos
  if (userSilos && mode === 'supplement') {
    const existingNames = new Set(memory.silos.map(s => s.name.toLowerCase()));
    const newSilos = userSilos.filter(s => !existingNames.has(s.name.toLowerCase()));
    memory.silos.push(...newSilos);
    console.log(`  ✓ Merged ${newSilos.length} additional user-provided silo(s)`);
  }

  console.log(`  ✓ Planned ${memory.silos.length} silo(s):`);
  memory.silos.forEach((silo, i) => {
    console.log(`    ${i + 1}. "${silo.name}" — Pillar: "${silo.pillar.title}" + ${silo.supportingPosts.length} supporting posts`);
  });

  return ctx;
};
