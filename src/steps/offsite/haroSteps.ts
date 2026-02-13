import * as fs from 'fs';
import * as path from 'path';
import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import type { ImapService } from '../../services/imapService.js';
import { HaroQueryParserChain } from '../../chains/offsite/haroQueryParserChain.js';
import { HaroRelevanceScorerChain } from '../../chains/offsite/haroRelevanceScorerChain.js';
import { HaroResponseDrafterChain } from '../../chains/offsite/haroResponseDrafterChain.js';
import type { HaroEmail, HaroQuery, HaroRelevanceScore, HaroDraftResponse } from '../../types/haro.js';
import type { PipelineConfig } from '../../types/wordpress.js';

/**
 * Memory structure for the HARO pipeline
 */
export interface HaroPipelineMemory {
  ollama: OllamaService;
  imap: ImapService;
  config: PipelineConfig;
  businessContext: string;
  contactInfo: string;
  emails: HaroEmail[];
  queries: HaroQuery[];
  relevant: HaroRelevanceScore[];
  skipped: HaroRelevanceScore[];
  drafts: HaroDraftResponse[];
}

/**
 * Step 1: Fetch unread emails from IMAP inbox
 */
export const fetchEmailsStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as HaroPipelineMemory;

  console.log('\n📬 Fetching unread HARO emails...');

  try {
    await memory.imap.connect();
    memory.emails = await memory.imap.fetchUnread();

    if (memory.emails.length === 0) {
      console.log('  ⊘ No new HARO queries to process');
      ctx.output = 'No new queries';
      return ctx;
    }

    console.log(`  ✓ Found ${memory.emails.length} HARO email(s)`);
    for (const email of memory.emails) {
      console.log(`    • [${email.platform}] ${email.subject}`);
    }
  } catch (error) {
    ctx.error = error instanceof Error ? error : new Error(String(error));
    console.error(`  ❌ Email fetch failed: ${ctx.error.message}`);
  }

  return ctx;
};

/**
 * Step 2: Parse raw emails into structured queries
 */
export const parseQueriesStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as HaroPipelineMemory;

  if (!memory.emails || memory.emails.length === 0) {
    return ctx;
  }

  console.log('\n🔍 Parsing journalist queries...');

  const parser = new HaroQueryParserChain(memory.ollama);

  if (memory.config.dryRun) {
    console.log(`  [DRY RUN] Would parse ${memory.emails.length} email(s)`);
    memory.queries = memory.emails.map(e => ({
      journalistName: 'Dry Run Journalist',
      outlet: 'Test Outlet',
      topic: e.subject,
      requirements: ['General expertise needed'],
      deadline: 'Not specified',
      sourceEmail: e.from,
      platform: e.platform,
      rawSubject: e.subject,
      rawEmailUid: e.uid,
    }));
    return ctx;
  }

  memory.queries = await parser.parseBatch(memory.emails);
  console.log(`  ✓ Parsed ${memory.queries.length} query(ies)`);

  return ctx;
};

/**
 * Step 3: Score queries for relevance to business niche
 */
export const scoreRelevanceStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as HaroPipelineMemory;

  if (!memory.queries || memory.queries.length === 0) {
    return ctx;
  }

  console.log('\n📊 Scoring query relevance...');

  const scorer = new HaroRelevanceScorerChain(memory.ollama);
  console.log(`  Threshold: ${scorer.getThreshold()}/100`);

  if (memory.config.dryRun) {
    console.log(`  [DRY RUN] Would score ${memory.queries.length} query(ies)`);
    memory.relevant = [];
    memory.skipped = [];
    return ctx;
  }

  const { relevant, skipped } = await scorer.scoreBatch(memory.queries, memory.businessContext);
  memory.relevant = relevant;
  memory.skipped = skipped;

  console.log(`  ✓ ${relevant.length} relevant, ${skipped.length} skipped`);

  return ctx;
};

/**
 * Step 4: Draft responses for relevant queries
 */
export const draftResponsesStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as HaroPipelineMemory;

  if (!memory.relevant || memory.relevant.length === 0) {
    console.log('\n  ⊘ No relevant queries to draft responses for');
    memory.drafts = [];
    return ctx;
  }

  console.log(`\n✍️  Drafting ${memory.relevant.length} response(s)...`);

  if (memory.config.dryRun) {
    console.log(`  [DRY RUN] Would draft ${memory.relevant.length} response(s)`);
    memory.drafts = [];
    return ctx;
  }

  const drafter = new HaroResponseDrafterChain(memory.ollama);
  memory.drafts = await drafter.draftBatch(
    memory.relevant,
    memory.businessContext,
    memory.contactInfo
  );

  console.log(`  ✓ Drafted ${memory.drafts.length} response(s)`);

  return ctx;
};

/**
 * Step 5: Save responses to output directory for human review
 */
export const saveResponsesStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as HaroPipelineMemory;

  if (!memory.drafts || memory.drafts.length === 0) {
    return ctx;
  }

  console.log('\n💾 Saving responses for review...');

  const outputDir = path.join(process.cwd(), 'output', 'haro-responses');
  const dateStr = new Date().toISOString().split('T')[0];
  const batchDir = path.join(outputDir, dateStr);

  if (!memory.config.dryRun) {
    fs.mkdirSync(batchDir, { recursive: true });
  }

  for (const draft of memory.drafts) {
    const safeOutlet = draft.query.outlet.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const safeTopic = draft.query.topic.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const baseName = `${safeOutlet}--${safeTopic}`;

    // Save JSON (machine-readable)
    const jsonPath = path.join(batchDir, `${baseName}.json`);
    if (!memory.config.dryRun) {
      fs.writeFileSync(jsonPath, JSON.stringify(draft, null, 2));
    }

    // Save Markdown (human-readable)
    const mdPath = path.join(batchDir, `${baseName}.md`);
    const markdown = formatDraftAsMarkdown(draft);
    if (!memory.config.dryRun) {
      fs.writeFileSync(mdPath, markdown);
    }

    console.log(`  ✓ Saved: ${baseName}`);
  }

  // Save summary
  const summaryPath = path.join(batchDir, '_summary.md');
  if (!memory.config.dryRun) {
    const summary = formatBatchSummary(memory);
    fs.writeFileSync(summaryPath, summary);
  }

  console.log(`  ✓ Saved to: ${batchDir}`);

  // Mark emails as processed
  if (!memory.config.dryRun) {
    for (const draft of memory.drafts) {
      try {
        await memory.imap.markProcessed(draft.query.rawEmailUid);
      } catch {
        console.warn(`  ⚠ Could not mark UID ${draft.query.rawEmailUid} as read`);
      }
    }
  }

  ctx.output = `${memory.drafts.length} response(s) saved to ${batchDir}`;
  return ctx;
};

/**
 * Format a draft response as human-readable Markdown
 */
function formatDraftAsMarkdown(draft: HaroDraftResponse): string {
  return `# HARO Response Draft

## Query Details
- **Journalist:** ${draft.query.journalistName}
- **Outlet:** ${draft.query.outlet}
- **Topic:** ${draft.query.topic}
- **Platform:** ${draft.query.platform}
- **Deadline:** ${draft.query.deadline}
- **Relevance Score:** ${draft.relevanceScore}/100

## Requirements
${draft.query.requirements.map(r => `- ${r}`).join('\n')}

---

## Draft Response

**Subject:** ${draft.subjectLine}

${draft.responseBody}

---

## Expert Quote (ready to use)

> ${draft.expertQuote}

## Credentials

${draft.credentials}

## Bio

${draft.bio}

---

*Drafted: ${draft.draftedAt}*
*Status: ${draft.status} — REQUIRES HUMAN REVIEW BEFORE SENDING*
`;
}

/**
 * Format a batch summary of all processed queries
 */
function formatBatchSummary(memory: HaroPipelineMemory): string {
  const lines = [
    `# HARO Batch Summary — ${new Date().toISOString().split('T')[0]}`,
    '',
    `## Results`,
    `- Emails fetched: ${memory.emails.length}`,
    `- Queries parsed: ${memory.queries.length}`,
    `- Relevant (drafted): ${memory.relevant.length}`,
    `- Skipped: ${memory.skipped.length}`,
    '',
    '## Relevant Queries',
    '',
  ];

  for (const item of memory.relevant) {
    lines.push(`### ${item.query.topic} (${item.score}/100)`);
    lines.push(`- Outlet: ${item.query.outlet}`);
    lines.push(`- Angle: ${item.suggestedAngle}`);
    lines.push('');
  }

  if (memory.skipped.length > 0) {
    lines.push('## Skipped Queries');
    lines.push('');
    for (const item of memory.skipped) {
      lines.push(`- ${item.query.topic} (${item.score}/100) — ${item.reasoning}`);
    }
  }

  return lines.join('\n');
}
