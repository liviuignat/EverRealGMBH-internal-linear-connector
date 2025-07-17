import { LinearWebhookPayload } from '../types/linear-webhook';
import { createLogger } from '../logger';

export function processProjectWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;
  const log = createLogger('project-processor', {
    projectId: data.id,
    action,
    organizationId: payload.organizationId,
  });

  log.info(
    {
      projectTitle: data.title,
      projectId: data.id,
    },
    `Project ${action}: ${data.id}`
  );
  // Add your project processing logic here

  return { success: true, action, projectId: data.id };
}
