import { LinearWebhookPayload } from '../../../types/linear-webhook';
import { IssueChangeDetection } from '../utils/change-detector';
import { processStatusReleaseChange } from '../../release-processor';
import { createLogger } from '../../../logger';

const STORY_LABEL_PARENT_ID = '037a6e45-7430-42bc-b6e9-c3a083514ead';

export async function processReleaseFlow(
  payload: LinearWebhookPayload,
  changeDetection: IssueChangeDetection
) {
  const { data, organizationId } = payload;
  const log = createLogger('release-flow', { issueId: data.id });

  // Only process if status actually changed
  const statusChanged = changeDetection.changes.status?.changed;

  if (!statusChanged) {
    log.debug(
      {
        issueId: data.id,
        statusChanged,
      },
      'No status change detected, skipping release processing'
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
        issueId: data.id,
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

  const currentState = changeDetection.changes.status?.current;
  const previousState = changeDetection.changes.status?.previous;

  if (!currentState || !previousState) {
    log.debug(
      {
        issueId: data.id,
        hasCurrentState: !!currentState,
        hasPreviousState: !!previousState,
      },
      'Missing current or previous state information, skipping release processing'
    );
    return;
  }

  log.info(
    {
      issueId: data.id,
      issueTitle: data.title,
      from: previousState.name,
      to: currentState.name,
    },
    'State change detected for story ticket, processing release change...'
  );

  try {
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
        previousState: {
          id: previousState.id,
          name: previousState.name,
          type: previousState.type,
        },
        currentState: {
          id: currentState.id,
          name: currentState.name,
          type: currentState.type,
        },
        organizationId: organizationId,
      });

      log.info(
        {
          issueId: data.id,
          labelName: storyLabel.name,
          from: previousState.name,
          to: currentState.name,
        },
        'Successfully processed release change'
      );
    } else {
      log.warn(
        {
          issueId: data.id,
          storyLabelParentId: STORY_LABEL_PARENT_ID,
        },
        'Story label found in initial check but not in processing - this should not happen'
      );
    }
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        issueId: data.id,
        issueTitle: data.title,
        from: previousState.name,
        to: currentState.name,
      },
      'Error processing release change'
    );
  }
}
