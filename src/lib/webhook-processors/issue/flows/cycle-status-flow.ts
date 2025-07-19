import { LinearWebhookPayload } from '../../../types/linear-webhook';
import { IssueChangeDetection } from '../utils/change-detector';
import { createLogger } from '../../../logger';

// Slack notification for cycle status updates
async function sendCycleStatusSlackNotification(
  issueNumber: string,
  issueUrl: string,
  issueTitle: string,
  issueId: string,
  statusOrLabel: string,
  cycleName: string
) {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_STATUS_CHANGE_URL_ISSUE;

  if (!slackWebhookUrl) {
    const log = createLogger('slack-cycle-notification');
    log.warn(
      'SLACK_WEBHOOK_STATUS_CHANGE_URL_ISSUE not configured, skipping Slack notification'
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

export async function processCycleStatusFlow(
  payload: LinearWebhookPayload,
  changeDetection: IssueChangeDetection
) {
  const { data } = payload;
  const log = createLogger('cycle-status-flow', { issueId: data.id });

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

  // Check for flagged label changes or status changes
  const labelsChanged = changeDetection.changes.labels?.changed;
  const statusChanged = changeDetection.changes.status?.changed;

  if (!labelsChanged && !statusChanged) {
    log.debug(
      {
        issueId: data.id,
        labelsChanged,
        statusChanged,
      },
      'No relevant label or status changes detected, skipping cycle status check'
    );
    return;
  }

  // Check current status and labels
  const currentStateName = data.state?.name?.toLowerCase();
  const currentLabels = data.labels?.map((label) => label.name) || [];

  // Check for flagged label (always trigger if present)
  const isFlaggedWithLabel = currentLabels.includes('🔴 FLAGGED');

  // Check current status for target states
  const isQATesting = currentStateName === 'qa testing';
  const isDone = currentStateName === 'done';

  let hasRelevantChange = false;
  let changeReason = '';

  // ALWAYS post message if flag label is applied
  if (isFlaggedWithLabel && labelsChanged) {
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
  // ONLY post status notifications if status changed TO "QA Testing" or "Done"
  else if (statusChanged && (isQATesting || isDone)) {
    const previousState = changeDetection.changes.status?.previous;
    const currentState = changeDetection.changes.status?.current;

    // Only trigger if we moved FROM a different state TO our target state
    if (isQATesting && previousState?.name?.toLowerCase() !== 'qa testing') {
      hasRelevantChange = true;
      changeReason = 'QA Testing';
      log.info(
        {
          issueId: data.id,
          previousState: previousState?.name,
          currentState: currentState?.name,
        },
        'Status actually changed FROM different state TO QA Testing'
      );
    } else if (isDone && previousState?.name?.toLowerCase() !== 'done') {
      hasRelevantChange = true;
      changeReason = 'Done';
      log.info(
        {
          issueId: data.id,
          previousState: previousState?.name,
          currentState: currentState?.name,
        },
        'Status actually changed FROM different state TO Done'
      );
    } else {
      log.debug(
        {
          issueId: data.id,
          previousState: previousState?.name,
          currentState: currentState?.name,
          wasAlreadyInTargetState:
            (isQATesting &&
              previousState?.name?.toLowerCase() === 'qa testing') ||
            (isDone && previousState?.name?.toLowerCase() === 'done'),
        },
        'Status change detected but not a transition TO target state'
      );
    }
  }

  if (!hasRelevantChange) {
    log.debug(
      {
        issueId: data.id,
        currentState: currentStateName,
        isQATesting,
        isDone,
        isFlagged: isFlaggedWithLabel,
        labelsChanged,
        statusChanged,
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

  // Check if cycle is active using enriched data
  const cycleDetails = changeDetection.enrichedData?.cycleDetails;

  if (!cycleDetails) {
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
  const isActiveCycle = !cycleDetails.completedAt;

  if (!isActiveCycle) {
    log.debug(
      {
        issueId: data.id,
        cycleId: cycleDetails.id,
        cycleName: cycleDetails.name,
        completedAt: cycleDetails.completedAt,
      },
      'Issue is in completed cycle, skipping notification'
    );
    return;
  }

  log.info(
    {
      issueId: data.id,
      issueTitle: data.title,
      changeReason,
      cycleName: cycleDetails.name,
      cycleId: cycleDetails.id,
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
    cycleDetails.name
  );
}
