import { LinearWebhookPayload } from '../types/linear-webhook';
import { linearApi } from '../api/linear-api';
import { processStatusReleaseChange } from './release-processor';
import { createLogger } from '../logger';

const STORY_LABEL_PARENT_ID = '037a6e45-7430-42bc-b6e9-c3a083514ead';

// Slack notification for urgent fireman validation issues
async function sendFiremanValidationSlackNotification(
  issueNumber: string,
  issueUrl: string,
  issueTitle: string,
  issueId: string
) {
  const slackWebhookUrl =
    'https://hooks.slack.com/services/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';

  if (!slackWebhookUrl) {
    const log = createLogger('slack-notification');
    log.warn(
      'SLACK_FIREMAN_WEBHOOK_URL not configured, skipping Slack notification'
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

    const response = await fetch(slackWebhookUrl, {
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

// Check if issue meets Fireman Validation criteria
async function checkFiremanValidationCriteria(payload: LinearWebhookPayload) {
  const { data } = payload;
  const log = createLogger('fireman-validation-check', { issueId: data.id });

  // Check if status is "Fireman Validation" (case insensitive)
  const isFiremanValidation =
    data.state?.name?.toLowerCase() === 'fireman validation';

  // Check if priority is "Urgent"
  const isUrgent = data.priority === 1; // Linear priority: 1 = Urgent, 2 = High, 3 = Medium, 4 = Low

  log.debug(
    {
      issueId: data.id,
      currentState: data.state?.name,
      priority: data.priority,
      isFiremanValidation,
      isUrgent,
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
  }
}

export async function processIssueWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;
  const log = createLogger('issue-processor', {
    issueId: data.id,
    action,
    organizationId: payload.organizationId,
  });

  log.info(
    {
      issueId: data.id,
      title: data.title,
      currentStateId: data.state?.id,
      updatedFromStateId: payload.updatedFrom?.stateId,
    },
    `Processing issue webhook: ${action}`
  );

  switch (action) {
    case 'create':
      log.info(
        { issueTitle: data.title },
        `New issue created: ${data.title} (${data.id})`
      );

      // Check for Fireman Validation criteria
      await checkFiremanValidationCriteria(payload);

      // Add your issue creation logic here
      break;

    case 'update':
      log.info(
        { issueTitle: data.title },
        `Issue updated: ${data.title} (${data.id})`
      );

      // Check for Fireman Validation criteria
      await checkFiremanValidationCriteria(payload);

      // Check if this is a state change and has the story label
      await handleStateChangeForRelease(payload);

      // Add your other issue update logic here
      break;

    case 'remove':
      log.info(`Issue removed: ${data.id}`);
      // Add your issue removal logic here
      break;

    default:
      log.warn({ unknownAction: action }, `Unknown issue action: ${action}`);
  }

  return { success: true, action, issueId: data.id };
}

async function handleStateChangeForRelease(payload: LinearWebhookPayload) {
  const { data, updatedFrom } = payload;
  const log = createLogger('issue-state-handler', { issueId: data.id });

  // Check if state actually changed
  const currentStateId = data.state?.id;
  const previousStateId = updatedFrom?.stateId;

  if (
    !currentStateId ||
    !previousStateId ||
    currentStateId === previousStateId
  ) {
    log.debug(
      {
        currentStateId,
        previousStateId,
      },
      'No state change detected, skipping release processing'
    );
    return;
  }

  // Check if issue has the story label
  const hasStoryLabel = data.labels?.some(
    (label) => label.parentId === STORY_LABEL_PARENT_ID
  );

  if (!hasStoryLabel) {
    log.debug(
      {
        labels: data.labels?.map((l) => ({
          id: l.id,
          name: l.name,
          parentId: l.parentId,
        })),
        storyLabelParentId: STORY_LABEL_PARENT_ID,
      },
      'Issue does not have story label, skipping release processing'
    );
    return;
  }

  log.info(
    {
      currentStateId,
      previousStateId,
      issueTitle: data.title,
    },
    'State change detected for story ticket, processing release change...'
  );

  try {
    // Fetch previous state details from Linear API
    const previousState = await linearApi.getIssueState(previousStateId);
    const currentState = await linearApi.getIssueState(currentStateId);

    log.info(
      {
        from: previousState?.name,
        to: currentState?.name,
        issueId: data.id,
        issueTitle: data.title,
        previousStateId,
        currentStateId,
      },
      'State transition'
    );

    // Find the story label to get its name for the release document
    const storyLabel = data.labels?.find(
      (label) => label.parentId === STORY_LABEL_PARENT_ID
    );

    if (storyLabel) {
      await processStatusReleaseChange({
        issueId: data.id,
        issueTitle: data.title || 'Untitled Issue',
        labelName: storyLabel.name,
        labelId: storyLabel.id,
        previousState: previousState || undefined,
        currentState: currentState || undefined,
        organizationId: payload.organizationId,
      });
    }
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        issueId: data.id,
        issueTitle: data.title,
        currentStateId,
        previousStateId,
      },
      'Error processing release change'
    );
  }
}
