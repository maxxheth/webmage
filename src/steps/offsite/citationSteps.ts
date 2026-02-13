import * as fs from 'fs';
import * as path from 'path';
import type { Step } from '../../utils/pipeline.js';
import type { OllamaService } from '../../services/ollamaService.js';
import { CitationBuilderChain } from '../../chains/offsite/citationBuilderChain.js';
import { BacklinkProspectorChain } from '../../chains/offsite/backlinkProspectorChain.js';
import type { CitationPackage, OutreachTemplate } from '../../types/social.js';
import type { PipelineConfig } from '../../types/wordpress.js';

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
}

/**
 * Step: Generate citation packages for local directories
 */
export const generateCitationPackagesStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as CitationPipelineMemory;

  console.log('  → Generating citation packages...');

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

  console.log(`  ✓ Generated ${memory.citations.length} citation packages`);
  return ctx;
};

/**
 * Step: Generate backlink outreach templates
 */
export const generateOutreachStep: Step<string> = async (ctx) => {
  const memory = ctx.memory as CitationPipelineMemory;

  console.log('  → Generating outreach templates...');

  if (memory.config.dryRun) {
    console.log('  ⊘ [DRY RUN] Would generate outreach templates');
    return ctx;
  }

  const chain = new BacklinkProspectorChain(memory.ollama);
  memory.outreach = await chain.generate(
    memory.contentTopics,
    memory.businessName,
    memory.businessWebsite,
    memory.businessNiche
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
