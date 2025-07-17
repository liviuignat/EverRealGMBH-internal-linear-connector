import { LinearWebhookPayload } from '../types/linear-webhook';

export function processProjectWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;

  console.log(`Project ${action}: ${data.id}`);
  // Add your project processing logic here

  return { success: true, action, projectId: data.id };
}
