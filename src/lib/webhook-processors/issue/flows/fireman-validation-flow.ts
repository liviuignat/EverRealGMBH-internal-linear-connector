import { LinearWebhookPayload } from '../../../types/linear-webhook';
import { IssueChangeDetection } from '../utils/change-detector';
import { createLogger } from '../../../logger';

// Slack notification for urgent fireman validation issues
async function sendFiremanValidationSlackNotification(
  issueNumber: string,
  issueUrl: string,
  issueTitle: string,
  issueId: string
) {
  const slackWebhookFiremanUrl = process.env.SLACK_WEBHOOK_FIREMAN_URL;

  if (!slackWebhookFiremanUrl) {
    const log = createLogger('slack-notification');
    log.warn(
      'SLACK_WEBHOOK_FIREMAN_URL not configured, skipping Slack notification'
    );
    return;
  }

  const log = createLogger('slack-notification', { issueId });

  try {
    const message = {
      text:
        '🚨 An `URGENT` ticket was transitioned / updated inside `Fireman Validation` ' +
        `<${issueUrl}|${issueNumber} ${issueTitle}>`,
    };

    const response = await fetch(slackWebhookFiremanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (response.ok) {
      log.info(
        {
          issueNumber,
          issueId,
          issueTitle,
          issueUrl,
        },
        'Successfully sent Fireman Validation Slack notification'
      );
    } else {
      const errorText = await response.text();
      log.error(
        {
          issueId,
          status: response.status,
          statusText: response.statusText,
          errorText,
        },
        'Failed to send Slack notification'
      );
    }
  } catch (error) {
    log.error(
      {
        issueId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Error sending Slack notification'
    );
  }
}

export async function processFiremanValidationFlow(
  payload: LinearWebhookPayload,
  changeDetection: IssueChangeDetection
) {
  const { data } = payload;
  const log = createLogger('fireman-validation-flow', { issueId: data.id });

  // Check if status or priority changed (trigger conditions)
  const statusChanged = changeDetection.changes.status?.changed;
  const priorityChanged = changeDetection.changes.priority?.changed;
  const titleChanged = changeDetection.changes.title?.changed;

  if (!statusChanged && !priorityChanged && !titleChanged) {
    log.debug(
      {
        issueId: data.id,
        statusChanged,
        priorityChanged,
      },
      'No status or priority changes detected, skipping Fireman Validation check'
    );
    return;
  }

  // Check if current status is "Fireman Validation" (case insensitive)
  const isFiremanValidation =
    data.state?.name?.toLowerCase() === 'fireman validation';

  // Check if priority is "Urgent" (Linear priority: 1 = Urgent, 2 = High, 3 = Medium, 4 = Low)
  const isUrgent = data.priority === 1;

  log.debug(
    {
      issueId: data.id,
      currentState: data.state?.name,
      priority: data.priority,
      isFiremanValidation,
      isUrgent,
      statusChanged,
      priorityChanged,
    },
    'Checking Fireman Validation criteria'
  );

  if (isFiremanValidation && isUrgent) {
    log.info(
      {
        issueId: data.id,
        issueTitle: data.title,
        state: data.state?.name,
        priority: data.priority,
      },
      'Issue meets Fireman Validation criteria, sending Slack notification'
    );

    // Send Slack notification
    const issueUrl = data.url || `https://linear.app/issue/${data.id}`;
    await sendFiremanValidationSlackNotification(
      data.identifier?.toString() || 'N/A',
      issueUrl,
      data.title || 'Untitled Issue',
      data.id
    );
  } else {
    log.debug(
      {
        issueId: data.id,
        isFiremanValidation,
        isUrgent,
        reason: !isFiremanValidation ? 'not_fireman_validation' : 'not_urgent',
      },
      'Issue does not meet Fireman Validation criteria'
    );
  }
}
