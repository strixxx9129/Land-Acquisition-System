import { workflowContentSchema } from '@lams/shared';
import { canonicalJson } from '../lib/hash.js';
import { logger } from '../logger.js';
import { WorkflowDefinition } from '../modules/workflow/workflowDefinition.model.js';
import { activateVersion, createWorkflowVersion } from '../modules/workflow/workflow.service.js';
import { nhActWorkflow } from './data/workflows/nhAct.js';
import { rfctlarrWorkflow } from './data/workflows/rfctlarr.js';

export const workflowSeeds = { RFCTLARR_2013: rfctlarrWorkflow, NH_ACT_1956: nhActWorkflow };

/**
 * Ensures each seeded workflow is active. If the seed differs from the active version, a new version
 * is created and activated (history is kept); otherwise nothing changes, so admin edits made through
 * the UI survive a re-seed unless the seed file itself changed.
 */
export async function seedWorkflows(): Promise<void> {
  for (const [code, raw] of Object.entries(workflowSeeds)) {
    const content = workflowContentSchema.parse(raw);
    const active = await WorkflowDefinition.findOne({ code, status: 'ACTIVE' }).lean();
    if (active && canonicalJson(workflowContentSchema.parse(active.content)) === canonicalJson(content)) continue;
    const doc = await createWorkflowVersion(code, content, active ? 'Updated from seed data' : 'Initial version from seed data');
    await activateVersion(code, doc.version);
    logger.info({ code, version: doc.version }, 'workflow seeded');
  }
}
