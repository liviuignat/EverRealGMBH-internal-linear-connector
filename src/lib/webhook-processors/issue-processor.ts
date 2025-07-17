import { LinearWebhookPayload } from '../types/linear-webhook';
import { linearApi } from '../api/linear-api';
import { processStatusReleaseChange } from './release-processor';
import { createLogger } from '../logger';

const STORY_LABEL_PARENT_ID = '037a6e45-7430-42bc-b6e9-c3a083514ead';

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
      // Add your issue creation logic here
      break;

    case 'update':
      log.info(
        { issueTitle: data.title },
        `Issue updated: ${data.title} (${data.id})`
      );

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
