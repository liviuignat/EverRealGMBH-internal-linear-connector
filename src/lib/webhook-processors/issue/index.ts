import { LinearWebhookPayload } from '../../types/linear-webhook';
import { issueChangeDetector } from './utils/change-detector';
import { processFiremanValidationFlow } from './flows/fireman-validation-flow';
import { processCycleStatusFlow } from './flows/cycle-status-flow';
import { processReleaseFlow } from './flows/release-flow';
import { createLogger } from '../../logger';

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
      action,
    },
    `Processing issue webhook: ${action}`
  );

  try {
    // Detect all changes with enriched data
    const changeDetection = await issueChangeDetector.detectChanges(payload);

    log.debug(
      {
        issueId: data.id,
        hasChanges: changeDetection.hasChanges,
        changeTypes: Object.keys(changeDetection.changes).filter(
          (key) =>
            changeDetection.changes[key as keyof typeof changeDetection.changes]
              ?.changed
        ),
        hasCycleDetails: !!changeDetection.enrichedData?.cycleDetails,
      },
      'Change detection completed'
    );

    switch (action) {
      case 'create':
        log.info(
          {
            issueTitle: data.title,
            team: data.team?.name,
            state: data.state?.name,
            priority: data.priority,
          },
          `New issue created: ${data.title} (${data.id})`
        );

        // Run flows for create action
        await Promise.all([
          processFiremanValidationFlow(payload, changeDetection),
          processCycleStatusFlow(payload, changeDetection),
          processReleaseFlow(payload, changeDetection),
        ]);
        break;

      case 'update':
        log.info(
          {
            issueTitle: data.title,
            team: data.team?.name,
            hasChanges: changeDetection.hasChanges,
          },
          `Issue updated: ${data.title} (${data.id})`
        );

        // Only run flows if there are actual changes
        if (changeDetection.hasChanges) {
          await Promise.all([
            processFiremanValidationFlow(payload, changeDetection),
            processCycleStatusFlow(payload, changeDetection),
            processReleaseFlow(payload, changeDetection),
          ]);
        } else {
          log.debug(
            { issueId: data.id },
            'No relevant changes detected, skipping flow processing'
          );
        }
        break;

      case 'remove':
        log.info(`Issue removed: ${data.id}`);
        // No flows needed for remove action
        break;

      default:
        log.warn({ unknownAction: action }, `Unknown issue action: ${action}`);
    }

    log.info(
      {
        issueId: data.id,
        action,
        hasChanges: changeDetection.hasChanges,
      },
      'Issue webhook processing completed successfully'
    );

    return {
      success: true,
      action,
      issueId: data.id,
      hasChanges: changeDetection.hasChanges,
      changeTypes: Object.keys(changeDetection.changes).filter(
        (key) =>
          changeDetection.changes[key as keyof typeof changeDetection.changes]
            ?.changed
      ),
    };
  } catch (error) {
    log.error(
      {
        issueId: data.id,
        action,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Error processing issue webhook'
    );

    return {
      success: false,
      action,
      issueId: data.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
