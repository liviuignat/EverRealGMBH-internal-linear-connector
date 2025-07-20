import { LinearWebhookPayload } from '../../../types/linear-webhook';
import { linearApi } from '../../../api/linear-api';
import { createLogger } from '../../../logger';

// Types for change detection
export interface Label {
  id: string;
  name: string;
  color: string;
  parentId?: string;
}

export interface State {
  id: string;
  name: string;
  type: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
}

export interface Cycle {
  id: string;
  name?: string;
}

export interface Project {
  id: string;
  name?: string;
}

export interface IssueChangeDetection {
  hasChanges: boolean;
  changes: {
    labels?: {
      changed: boolean;
      added: Label[];
      removed: Label[];
      current: Label[];
      previous: Label[];
    };
    status?: {
      changed: boolean;
      current: State;
      previous?: State;
    };
    assignee?: {
      changed: boolean;
      current?: User;
      previous?: User;
    };
    priority?: {
      changed: boolean;
      current: number;
      previous?: number;
    };
    cycle?: {
      changed: boolean;
      current?: Cycle;
      previous?: Cycle;
    };
    project?: {
      changed: boolean;
      current?: Project;
      previous?: Project;
    };
    title?: {
      changed: boolean;
      current: string;
      previous?: string;
    };
    description?: {
      changed: boolean;
      current?: string;
      previous?: string;
    };
    estimate?: {
      changed: boolean;
      current?: number;
      previous?: number;
    };
  };
  enrichedData?: {
    cycleDetails?: {
      id: string;
      name: string;
      completedAt?: string;
      startsAt?: string;
      endsAt?: string;
    } | null;
  };
}

export class IssueChangeDetector {
  private log = createLogger('issue-change-detector');

  async detectChanges(
    payload: LinearWebhookPayload
  ): Promise<IssueChangeDetection> {
    const { data, updatedFrom, action } = payload;

    this.log.debug(
      {
        issueId: data.id,
        action,
        hasUpdatedFrom: !!updatedFrom,
      },
      'Starting change detection'
    );

    const result: IssueChangeDetection = {
      hasChanges: false,
      changes: {},
      enrichedData: {},
    };

    // For create actions, everything is "new"
    if (action === 'create') {
      result.hasChanges = true;
      result.changes = {
        status: {
          changed: true,
          current: data.state || { id: '', name: 'Unknown', type: 'unstarted' },
        },
        assignee: {
          changed: true,
          current: data.assignee,
        },
        priority: {
          changed: true,
          current: data.priority || 0,
        },
        cycle: {
          changed: true,
          current: data.cycle,
        },
        project: {
          changed: true,
          current: data.project,
        },
        labels: {
          changed: true,
          added: data.labels || [],
          removed: [],
          current: data.labels || [],
          previous: [],
        },
        title: {
          changed: true,
          current: data.title || '',
        },
        description: {
          changed: true,
          current: data.description,
        },
        estimate: {
          changed: true,
          current: data.estimate,
        },
      };

      // Fetch cycle details if exists
      if (data.cycle?.id) {
        try {
          result.enrichedData!.cycleDetails = await linearApi.getCycleDetails(
            data.cycle.id
          );
        } catch (error) {
          this.log.warn(
            {
              issueId: data.id,
              cycleId: data.cycle.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'Error fetching cycle details for new issue'
          );
        }
      }

      return result;
    }

    // For update actions, perform simplified comparison using webhook data
    if (action === 'update' && updatedFrom) {
      return await this.performSimplifiedComparison(data, updatedFrom);
    }

    this.log.debug(
      {
        issueId: data.id,
        action,
        reason: 'no_updated_from_or_unsupported_action',
      },
      'No changes detected - unsupported action or missing updatedFrom'
    );

    return result;
  }

  private async performSimplifiedComparison(
    currentData: LinearWebhookPayload['data'],
    updatedFrom: NonNullable<LinearWebhookPayload['updatedFrom']>
  ): Promise<IssueChangeDetection> {
    const result: IssueChangeDetection = {
      hasChanges: false,
      changes: {},
      enrichedData: {},
    };

    this.log.debug(
      {
        issueId: currentData.id,
        updatedFromFields: Object.keys(updatedFrom),
        hasStateId: !!updatedFrom.stateId,
        currentStateId: currentData.state?.id,
        updatedFromStateId: updatedFrom.stateId,
      },
      'Performing simplified comparison'
    );

    // Status changes - only detect if we have both current and previous state IDs
    if (
      updatedFrom.stateId &&
      currentData.state?.id &&
      currentData.state.id !== updatedFrom.stateId
    ) {
      try {
        const previousState = await linearApi.getIssueState(
          updatedFrom.stateId
        );

        this.log.debug(
          {
            issueId: currentData.id,
            previousStateId: updatedFrom.stateId,
            currentStateId: currentData.state.id,
            fetchedPreviousState: !!previousState,
          },
          'Attempting to fetch previous state for comparison'
        );

        if (previousState) {
          result.changes.status = {
            changed: true,
            current: currentData.state,
            previous: {
              id: previousState.id,
              name: previousState.name,
              type: previousState.type,
            },
          };
          result.hasChanges = true;

          this.log.info(
            {
              issueId: currentData.id,
              from: previousState.name,
              to: currentData.state.name,
              fromId: previousState.id,
              toId: currentData.state.id,
            },
            'Status change detected and confirmed'
          );
        } else {
          this.log.warn(
            {
              issueId: currentData.id,
              previousStateId: updatedFrom.stateId,
            },
            'Previous state not found via API, but state IDs are different'
          );
        }
      } catch (error) {
        this.log.error(
          {
            issueId: currentData.id,
            previousStateId: updatedFrom.stateId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Error fetching previous state'
        );
      }
    } else {
      this.log.debug(
        {
          issueId: currentData.id,
          hasUpdatedFromStateId: !!updatedFrom.stateId,
          hasCurrentStateId: !!currentData.state?.id,
          stateIdsEqual: updatedFrom.stateId === currentData.state?.id,
          reason: !updatedFrom.stateId
            ? 'no_previous_state_id_in_webhook'
            : !currentData.state?.id
            ? 'no_current_state_id'
            : 'state_ids_are_equal',
        },
        'No status change detected'
      );
    }

    // Priority changes
    if (
      updatedFrom.priority !== undefined &&
      currentData.priority !== updatedFrom.priority
    ) {
      result.changes.priority = {
        changed: true,
        current: currentData.priority || 0,
        previous: updatedFrom.priority,
      };
      result.hasChanges = true;

      this.log.info(
        {
          issueId: currentData.id,
          from: updatedFrom.priority,
          to: currentData.priority,
        },
        'Priority change detected'
      );
    }

    // Assignee changes
    if (updatedFrom.assigneeId !== undefined) {
      const currentAssigneeId = currentData.assignee?.id;
      if (currentAssigneeId !== updatedFrom.assigneeId) {
        result.changes.assignee = {
          changed: true,
          current: currentData.assignee,
          previous: updatedFrom.assigneeId
            ? { id: updatedFrom.assigneeId, name: 'Unknown' }
            : undefined,
        };
        result.hasChanges = true;

        this.log.info(
          {
            issueId: currentData.id,
            from: updatedFrom.assigneeId || 'Unassigned',
            to: currentAssigneeId || 'Unassigned',
          },
          'Assignee change detected'
        );
      }
    }

    // Cycle changes
    if (updatedFrom.cycleId !== undefined) {
      const currentCycleId = currentData.cycle?.id;
      if (currentCycleId !== updatedFrom.cycleId) {
        result.changes.cycle = {
          changed: true,
          current: currentData.cycle,
          previous: updatedFrom.cycleId
            ? { id: updatedFrom.cycleId, name: 'Unknown' }
            : undefined,
        };
        result.hasChanges = true;

        this.log.info(
          {
            issueId: currentData.id,
            from: updatedFrom.cycleId || 'No cycle',
            to: currentCycleId || 'No cycle',
          },
          'Cycle change detected'
        );
      }
    }

    // Project changes
    if (updatedFrom.projectId !== undefined) {
      const currentProjectId = currentData.project?.id;
      if (currentProjectId !== updatedFrom.projectId) {
        result.changes.project = {
          changed: true,
          current: currentData.project,
          previous: updatedFrom.projectId
            ? { id: updatedFrom.projectId, name: 'Unknown' }
            : undefined,
        };
        result.hasChanges = true;

        this.log.info(
          {
            issueId: currentData.id,
            from: updatedFrom.projectId || 'No project',
            to: currentProjectId || 'No project',
          },
          'Project change detected'
        );
      }
    }

    // Title changes
    if (
      updatedFrom.title !== undefined &&
      currentData.title !== updatedFrom.title
    ) {
      result.changes.title = {
        changed: true,
        current: currentData.title || '',
        previous: updatedFrom.title,
      };
      result.hasChanges = true;

      this.log.info(
        {
          issueId: currentData.id,
          from: updatedFrom.title,
          to: currentData.title,
        },
        'Title change detected'
      );
    }

    // Description changes
    if (
      updatedFrom.description !== undefined &&
      currentData.description !== updatedFrom.description
    ) {
      result.changes.description = {
        changed: true,
        current: currentData.description,
        previous: updatedFrom.description,
      };
      result.hasChanges = true;

      this.log.info(
        {
          issueId: currentData.id,
          hasDescriptionChange: true,
        },
        'Description change detected'
      );
    }

    // Estimate changes
    if (
      updatedFrom.estimate !== undefined &&
      currentData.estimate !== updatedFrom.estimate
    ) {
      result.changes.estimate = {
        changed: true,
        current: currentData.estimate,
        previous: updatedFrom.estimate,
      };
      result.hasChanges = true;

      this.log.info(
        {
          issueId: currentData.id,
          from: updatedFrom.estimate,
          to: currentData.estimate,
        },
        'Estimate change detected'
      );
    }

    // Enhanced label change detection
    // For updates, we assume labels changed if we have any labels and this is an update action
    // This is a simplified approach since we can't reliably compare previous labels without API
    const currentLabels = currentData.labels || [];
    const hasFlaggedLabel = currentLabels.some(
      (label) => label.name === '🔴 FLAGGED'
    );

    // For updates, assume labels potentially changed if:
    // 1. Issue has flagged label (main case we care about)
    // 2. OR issue has labels and no other changes detected (likely a label-only update)
    const labelsLikelyChanged =
      hasFlaggedLabel || (currentLabels.length > 0 && !result.hasChanges);

    if (labelsLikelyChanged) {
      result.changes.labels = {
        changed: true,
        added: hasFlaggedLabel
          ? [{ id: '', name: '🔴 FLAGGED', color: '', parentId: '' }]
          : [],
        removed: [],
        current: currentLabels,
        previous: [],
      };
      result.hasChanges = true;

      this.log.debug(
        {
          issueId: currentData.id,
          hasFlaggedLabel,
          labelsCount: currentLabels.length,
          hasOtherChanges:
            Object.keys(result.changes).filter(
              (k) =>
                k !== 'labels' &&
                result.changes[k as keyof typeof result.changes]?.changed
            ).length > 0,
          labelNames: currentLabels.map((l) => l.name),
        },
        'Label changes detected (simplified detection)'
      );
    } else {
      this.log.debug(
        {
          issueId: currentData.id,
          hasFlaggedLabel,
          labelsCount: currentLabels.length,
          hasOtherChanges: result.hasChanges,
        },
        'No label changes detected'
      );
    }

    // Always fetch cycle details if issue has a cycle
    if (currentData.cycle?.id) {
      try {
        result.enrichedData!.cycleDetails = await linearApi.getCycleDetails(
          currentData.cycle.id
        );
      } catch (error) {
        this.log.warn(
          {
            issueId: currentData.id,
            cycleId: currentData.cycle.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Error fetching cycle details'
        );
      }
    }

    this.log.info(
      {
        issueId: currentData.id,
        hasChanges: result.hasChanges,
        changeTypes: Object.keys(result.changes).filter(
          (key) => result.changes[key as keyof typeof result.changes]?.changed
        ),
      },
      'Change detection completed'
    );

    return result;
  }
}

export const issueChangeDetector = new IssueChangeDetector();
