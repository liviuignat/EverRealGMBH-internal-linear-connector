import { LinearWebhookPayload } from '../types/linear-webhook';

export function processCommentWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;

  console.log(`Comment ${action} for issue: ${data.id}`);
  // Add your comment processing logic here

  return { success: true, action, commentId: data.id };
}
