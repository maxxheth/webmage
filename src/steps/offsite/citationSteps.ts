import * as fs from 'fs';
import * as path from 'path';
import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import { CitationBuilderChain } from '../../chains/offsite/citationBuilderChain.js';
import { BacklinkProspectorChain } from '../../chains/offsite/backlinkProspectorChain.js';
import type { CitationPackage, OutreachTemplate } from '../../types/social.js';
import type { PipelineConfig } from '../../types/wordpress.js';
import type { InputLoader } from '../../utils/inputLoader.js';
import { OFFSITE_INPUT_FILES } from '../../types/input.js';

/**
 * Memory structure for citation/backlink pipeline
 */
export interface CitationPipelineMemory {
  ollama: OllamaService;
  config: PipelineConfig;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessWebsite: string;
  businessNiche: string;
  contentTopics: string[];
  citations?: CitationPackage[];
  outreach?: OutreachTemplate[];
  inputLoader?: InputLoader;
}

/**
 * Step: Generate citation packages for local directories
 */
export const generateCitationPackagesStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as CitationPipelineMemory;

  console.log('  → Generating citation packages...');

  // Check for user-provided citation overrides
  const loader = memory.inputLoader;
  if (loader?.exists('offsite', OFFSITE_INPUT_FILES.CITATION_OVERRIDES_JSON)) {
    const userCitations = loader.readJson<CitationPackage[]>('offsite', OFFSITE_INPUT_FILES.CITATION_OVERRIDES_JSON);
    const mode = loader.getMode('offsite', OFFSITE_INPUT_FILES.CITATION_OVERRIDES_JSON);

    if (userCitations) {
      console.log(`  ↩ Loaded ${userCitations.length} citation(s) from input/offsite/citation-overrides.json [${mode}]`);

      if (mode === 'replace') {
        memory.citations = userCitations;
        console.log(`  ✓ Using ${memory.citations.length} user-provided citations (replace mode)`);
        return ctx;
      }
    }
  }

  if (memory.config.dryRun) {
    console.log('  ⊘ [DRY RUN] Would generate citation packages');
    return ctx;
  }

  const chain = new CitationBuilderChain(memory.ollama);
  memory.citations = await chain.generate(
    memory.businessName,
    memory.businessAddress,
    memory.businessPhone,
    memory.businessWebsite,
    memory.businessNiche
  );

  // Supplement mode: merge user citations
  if (loader?.exists('offsite', OFFSITE_INPUT_FILES.CITATION_OVERRIDES_JSON)) {
    const userCitations = loader.readJson<CitationPackage[]>('offsite', OFFSITE_INPUT_FILES.CITATION_OVERRIDES_JSON);
    const mode = loader.getMode('offsite', OFFSITE_INPUT_FILES.CITATION_OVERRIDES_JSON);
    if (userCitations && mode === 'supplement') {
      const existingUrls = new Set(memory.citations.map(c => c.directoryUrl.toLowerCase()));
      const newCitations = userCitations.filter(c => !existingUrls.has(c.directoryUrl.toLowerCase()));
      memory.citations.push(...newCitations);
      console.log(`  ✓ Merged ${newCitations.length} additional user-provided citation(s)`);
    }
  }

  console.log(`  ✓ Generated ${memory.citations.length} citation packages`);
  return ctx;
};

/**
 * Step: Generate backlink outreach templates
 */
export const generateOutreachStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as CitationPipelineMemory;

  console.log('  → Generating outreach templates...');

  // Check for user-provided content topics
  const loader = memory.inputLoader;
  if (loader?.exists('offsite', OFFSITE_INPUT_FILES.CONTENT_TOPICS_TXT)) {
    const userTopics = loader.readText('offsite', OFFSITE_INPUT_FILES.CONTENT_TOPICS_TXT);
    const mode = loader.getMode('offsite', OFFSITE_INPUT_FILES.CONTENT_TOPICS_TXT);

    if (userTopics.length > 0) {
      console.log(`  ↩ Loaded ${userTopics.length} content topic(s) from input/offsite/content-topics.txt [${mode}]`);
      if (mode === 'replace') {
        memory.contentTopics = userTopics;
      } else {
        // Supplement: add user topics that aren't already present
        const existing = new Set(memory.contentTopics.map(t => t.toLowerCase()));
        const newTopics = userTopics.filter(t => !existing.has(t.toLowerCase()));
        memory.contentTopics.push(...newTopics);
        console.log(`  ✓ Merged ${newTopics.length} additional topic(s)`);
      }
    }
  }

  // Check for outreach target URLs
  let targetUrls: string[] | undefined;
  if (loader?.exists('offsite', OFFSITE_INPUT_FILES.OUTREACH_TARGETS_TXT)) {
    targetUrls = loader.readText('offsite', OFFSITE_INPUT_FILES.OUTREACH_TARGETS_TXT);
    if (targetUrls.length > 0) {
      console.log(`  ↩ Loaded ${targetUrls.length} outreach target(s) from input/offsite/outreach-targets.txt`);
    }
  }

  if (memory.config.dryRun) {
    console.log('  ⊘ [DRY RUN] Would generate outreach templates');
    return ctx;
  }

  const chain = new BacklinkProspectorChain(memory.ollama);
  memory.outreach = await chain.generate(
    memory.contentTopics,
    memory.businessName,
    memory.businessWebsite,
    memory.businessNiche,
    undefined,
    targetUrls
  );

  console.log(`  ✓ Generated ${memory.outreach.length} outreach templates`);
  memory.outreach.forEach((template, i) => {
    console.log(`    ${i + 1}. [${template.type}] ${template.subjectLine}`);
  });

  return ctx;
};

/**
 * Step: Save citation packages and outreach templates to output files
 */
export const saveCitationFilesStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as CitationPipelineMemory;

  const outputDir = path.join(process.cwd(), 'output');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Save citations
  if (memory.citations && memory.citations.length > 0) {
    const citationsDir = path.join(outputDir, 'citations');
    if (!fs.existsSync(citationsDir)) {
      fs.mkdirSync(citationsDir, { recursive: true });
    }

    const citationsFile = path.join(citationsDir, `citations-${timestamp}.json`);
    fs.writeFileSync(citationsFile, JSON.stringify(memory.citations, null, 2));
    console.log(`  📋 Citations saved to: ${citationsFile}`);

    // Also save as CSV for easy spreadsheet import
    const csvHeader = 'Directory,URL,Category,Business Name,Address,Phone,Website,Description,Status,Notes';
    const csvRows = memory.citations.map(c =>
      `"${c.directoryName}","${c.directoryUrl}","${c.category}","${c.fields.businessName}","${c.fields.address}","${c.fields.phone}","${c.fields.website}","${c.fields.description}","${c.status}","${c.notes || ''}"`
    );
    const csvFile = path.join(citationsDir, `citations-${timestamp}.csv`);
    fs.writeFileSync(csvFile, [csvHeader, ...csvRows].join('\n'));
    console.log(`  📋 Citations CSV saved to: ${csvFile}`);
  }

  // Save outreach templates
  if (memory.outreach && memory.outreach.length > 0) {
    const outreachDir = path.join(outputDir, 'outreach');
    if (!fs.existsSync(outreachDir)) {
      fs.mkdirSync(outreachDir, { recursive: true });
    }

    const outreachFile = path.join(outreachDir, `outreach-${timestamp}.json`);
    fs.writeFileSync(outreachFile, JSON.stringify(memory.outreach, null, 2));
    console.log(`  📋 Outreach templates saved to: ${outreachFile}`);

    // Save each template as a separate markdown file for easy reading
    memory.outreach.forEach((template, i) => {
      const mdContent = `# ${template.subjectLine}

**Type:** ${template.type}
**Target:** ${template.targetUrl}

## Email Body

${template.emailBody}

## Content Angle

${template.contentAngle}

## Notes

${template.notes}
`;
      const mdFile = path.join(outreachDir, `${template.type}-${i + 1}-${timestamp}.md`);
      fs.writeFileSync(mdFile, mdContent);
    });
    console.log(`  📋 Individual outreach templates saved as markdown`);
  }

  return ctx;
};
