import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import { SiteAuditChain } from '../../chains/onsite/siteAuditChain.js';
import { KeywordResearchChain } from '../../chains/onsite/keywordResearchChain.js';
import { SiloPlannerChain } from '../../chains/onsite/siloPlannerChain.js';
import type { CrawlResult, SiteAudit, KeywordCluster, SiloPlan } from '../../types/seo.js';

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

  console.log('  → Researching keywords...');
  const keywordChain = new KeywordResearchChain(memory.ollama);
  memory.keywords = await keywordChain.research(
    memory.businessNiche,
    memory.location,
    memory.audit,
    memory.targetClusterCount
  );
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

  console.log('  → Planning content silos...');
  const siloChain = new SiloPlannerChain(memory.ollama);
  memory.silos = await siloChain.plan(
    memory.businessNiche,
    memory.location,
    memory.keywords
  );
  console.log(`  ✓ Planned ${memory.silos.length} silo(s):`);
  memory.silos.forEach((silo, i) => {
    console.log(`    ${i + 1}. "${silo.name}" — Pillar: "${silo.pillar.title}" + ${silo.supportingPosts.length} supporting posts`);
  });

  return ctx;
};
