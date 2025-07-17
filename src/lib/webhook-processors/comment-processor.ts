import { LinearWebhookPayload } from '../types/linear-webhook';
import { createLogger } from '../logger';

export function processCommentWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;
  const log = createLogger('comment-processor', {
    commentId: data.id,
    action,
    organizationId: payload.organizationId,
  });

  log.info(
    {
      commentId: data.id,
      issueId: data.id, // Assuming comment data has issue context
    },
    `Comment ${action} for issue: ${data.id}`
  );
  // Add your comment processing logic here

  return { success: true, action, commentId: data.id };
}
