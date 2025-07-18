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

// Slack notification for cycle status updates
async function sendCycleStatusSlackNotification(
  issueNumber: string,
  issueUrl: string,
  issueTitle: string,
  issueId: string,
  statusOrLabel: string,
  cycleName: string
) {
  const slackWebhookUrl =
    'https://hooks.slack.com/services/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';

  if (!slackWebhookUrl) {
    const log = createLogger('slack-cycle-notification');
    log.warn(
      'SLACK_CYCLE_STATUS_WEBHOOK_URL not configured, skipping Slack notification'
    );
    return;
  }

  const log = createLogger('slack-cycle-notification', { issueId });

  try {
    let message;
    if (statusOrLabel === '🔴 FLAGGED') {
      message = {
        text: `🚩 Issue flagged in active cycle "${cycleName}": <${issueUrl}|${issueNumber} ${issueTitle}>`,
      };
    } else {
      message = {
        text: `✅ Issue moved to "${statusOrLabel}" in active cycle "${cycleName}": <${issueUrl}|${issueNumber} ${issueTitle}>`,
      };
    }

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
          statusOrLabel,
          cycleName,
        },
        'Successfully sent cycle status Slack notification'
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
        'Failed to send cycle status Slack notification'
      );
    }
  } catch (error) {
    log.error(
      {
        issueId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Error sending cycle status Slack notification'
    );
  }
}

// Check if issue is in active cycle and meets status criteria
async function checkCycleStatusCriteria(payload: LinearWebhookPayload) {
  const { data, updatedFrom, action } = payload;
  const log = createLogger('cycle-status-check', { issueId: data.id });

  // Only process notifications for "Engineering - PRODUCT" team
  const teamName = data.team?.name;
  if (teamName !== 'Engineering - PRODUCT') {
    log.debug(
      {
        issueId: data.id,
        teamName,
        teamId: data.team?.id,
      },
      'Issue not in Engineering - PRODUCT team, skipping cycle status check'
    );
    return;
  }

  log.debug(
    {
      issueId: data.id,
      teamName,
      teamId: data.team?.id,
    },
    'Issue belongs to Engineering - PRODUCT team, proceeding with cycle status check'
  );

  // Check current status and labels
  const currentStateId = data.state?.id;
  const previousStateId = updatedFrom?.stateId;
  const currentStateName = data.state?.name?.toLowerCase();
  const currentLabels = data.labels?.map((label) => label.name) || [];

  // Check for newly added 🔴 FLAGGED label
  const isFlaggedWithLabel = currentLabels.includes('🔴 FLAGGED');

  // Check current status
  const isQATesting = currentStateName === 'qa testing';
  const isDone = currentStateName === 'done';
  const hasStatusChanged = currentStateId !== previousStateId;

  let hasRelevantChange = false;
  let changeReason = '';

  // ALWAYS post message if flag label is applied
  if (isFlaggedWithLabel) {
    hasRelevantChange = true;
    changeReason = '🔴 FLAGGED';

    log.debug(
      {
        issueId: data.id,
        currentLabels,
      },
      'Issue has 🔴 FLAGGED label - always posting notification'
    );
  }
  // ONLY post status notifications if status ACTUALLY changed TO "QA Testing" or "Done"
  else if (hasStatusChanged && previousStateId && (isQATesting || isDone)) {
    // Only trigger if status actually changed TO these target states
    try {
      const previousState = await linearApi.getIssueState(previousStateId);
      const previousStateName = previousState?.name?.toLowerCase();

      // Only trigger if we moved FROM a different state TO our target state
      if (
        isQATesting &&
        previousStateName &&
        previousStateName !== 'qa testing'
      ) {
        hasRelevantChange = true;
        changeReason = 'QA Testing';
        log.info(
          {
            issueId: data.id,
            previousState: previousStateName,
            currentState: currentStateName,
            previousStateId,
            currentStateId,
          },
          'Status actually changed FROM different state TO QA Testing'
        );
      } else if (isDone && previousStateName && previousStateName !== 'done') {
        hasRelevantChange = true;
        changeReason = 'Done';
        log.info(
          {
            issueId: data.id,
            previousState: previousStateName,
            currentState: currentStateName,
            previousStateId,
            currentStateId,
          },
          'Status actually changed FROM different state TO Done'
        );
      } else {
        log.debug(
          {
            issueId: data.id,
            previousState: previousStateName,
            currentState: currentStateName,
            hasStatusChanged,
            wasAlreadyInTargetState:
              (isQATesting && previousStateName === 'qa testing') ||
              (isDone && previousStateName === 'done'),
          },
          'Status change detected but not a transition TO target state - likely label/other field change'
        );
      }
    } catch (error) {
      log.error(
        {
          issueId: data.id,
          previousStateId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error fetching previous state for comparison'
      );
    }
  } else if (
    !previousStateId &&
    (isQATesting || isDone) &&
    action === 'create'
  ) {
    // Handle ONLY new issues created directly in target states (not updates with missing previousStateId)
    hasRelevantChange = true;
    changeReason = isQATesting ? 'QA Testing' : 'Done';
    log.debug(
      {
        issueId: data.id,
        currentState: currentStateName,
        noPreviousState: true,
        action,
      },
      `New issue created directly in ${changeReason} status`
    );
  } else if (
    !previousStateId &&
    (isQATesting || isDone) &&
    action === 'update'
  ) {
    // This is an update where Linear didn't provide previousStateId (likely label/other field change)
    log.debug(
      {
        issueId: data.id,
        currentState: currentStateName,
        noPreviousState: true,
        action,
        reason: 'likely_label_or_field_change',
      },
      `Update action with no previousStateId - likely label/field change, not status change`
    );
  }

  if (!hasRelevantChange) {
    log.debug(
      {
        issueId: data.id,
        currentState: currentStateName,
        hasStatusChanged,
        isQATesting,
        isDone,
        isFlagged: isFlaggedWithLabel,
        previousStateId,
        currentStateId,
      },
      'No relevant status change detected, skipping cycle status check'
    );
    return;
  }

  // Check if issue has cycle information
  if (!data.cycle?.id) {
    log.debug(
      {
        issueId: data.id,
        hasCycle: false,
      },
      'Issue not assigned to any cycle, skipping cycle status check'
    );
    return;
  }

  try {
    // Fetch cycle details to check if it's active
    const cycle = await linearApi.getCycleDetails(data.cycle.id);

    if (!cycle) {
      log.debug(
        {
          issueId: data.id,
          cycleId: data.cycle.id,
        },
        'Could not fetch cycle details'
      );
      return;
    }

    // Check if cycle is active (not completed)
    const isActiveCycle = !cycle.completedAt;

    if (!isActiveCycle) {
      log.debug(
        {
          issueId: data.id,
          cycleId: cycle.id,
          cycleName: cycle.name,
          completedAt: cycle.completedAt,
        },
        'Issue is in completed cycle, skipping notification'
      );
      return;
    }

    log.debug(
      {
        issueId: data.id,
        currentState: data.state?.name,
        previousStateId,
        hasStatusChanged,
        hasRelevantChange,
        changeReason,
        isQATesting,
        isDone,
        isFlagged: isFlaggedWithLabel,
        cycleName: cycle.name,
        cycleId: cycle.id,
      },
      'Checking cycle status criteria with change detection'
    );

    // We already determined the change reason, so use it directly
    log.info(
      {
        issueId: data.id,
        issueTitle: data.title,
        changeReason,
        cycleName: cycle.name,
        cycleId: cycle.id,
        previousStateId,
        currentStateId,
      },
      'Issue status changed in active cycle, sending Slack notification'
    );

    // Send Slack notification
    const issueUrl = data.url || `https://linear.app/issue/${data.id}`;
    await sendCycleStatusSlackNotification(
      data.identifier?.toString() || 'N/A',
      issueUrl,
      data.title || 'Untitled Issue',
      data.id,
      changeReason,
      cycle.name
    );
  } catch (error) {
    log.error(
      {
        issueId: data.id,
        cycleId: data.cycle?.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error checking cycle status criteria'
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

      // Check for cycle status criteria (QA Testing, Done, or Flagged)
      await checkCycleStatusCriteria(payload);

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
