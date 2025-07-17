import { LinearWebhookPayload } from '../types/linear-webhook';
import { linearApi } from '../api/linear-api';
import { processStatusReleaseChange } from './release-processor';

const STORY_LABEL_PARENT_ID = '037a6e45-7430-42bc-b6e9-c3a083514ead';

export async function processIssueWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;

  console.log(`Processing issue webhook: ${action}`, {
    issueId: data.id,
    title: data.title,
    currentStateId: data.state?.id,
    updatedFromStateId: payload.updatedFrom?.stateId,
  });

  switch (action) {
    case 'create':
      console.log(`New issue created: ${data.title} (${data.id})`);
      // Add your issue creation logic here
      break;

    case 'update':
      console.log(`Issue updated: ${data.title} (${data.id})`);

      // Check if this is a state change and has the story label
      await handleStateChangeForRelease(payload);

      // Add your other issue update logic here
      break;

    case 'remove':
      console.log(`Issue removed: ${data.id}`);
      // Add your issue removal logic here
      break;

    default:
      console.log(`Unknown issue action: ${action}`);
  }

  return { success: true, action, issueId: data.id };
}

async function handleStateChangeForRelease(payload: LinearWebhookPayload) {
  const { data, updatedFrom } = payload;

  // Check if state actually changed
  const currentStateId = data.state?.id;
  const previousStateId = updatedFrom?.stateId;

  if (
    !currentStateId ||
    !previousStateId ||
    currentStateId === previousStateId
  ) {
    console.log('No state change detected, skipping release processing');
    return;
  }

  // Check if issue has the story label
  const hasStoryLabel = data.labels?.some(
    (label) => label.parentId === STORY_LABEL_PARENT_ID
  );

  if (!hasStoryLabel) {
    console.log('Issue does not have story label, skipping release processing');
    return;
  }

  console.log(
    'State change detected for story ticket, processing release change...'
  );

  try {
    // Fetch previous state details from Linear API
    const previousState = await linearApi.getIssueState(previousStateId);
    const currentState = await linearApi.getIssueState(currentStateId);

    console.log('State transition:', {
      from: previousState?.name,
      to: currentState?.name,
      issueId: data.id,
      issueTitle: data.title,
    });

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
    console.error('Error processing release change:', error);
  }
}
