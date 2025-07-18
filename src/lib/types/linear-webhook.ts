// Linear webhook payload types
export interface LinearWebhookPayload {
  action: string;
  data: {
    id: string;
    title?: string;
    description?: string;
    estimate?: number; // Story points
    state?: {
      id: string;
      name: string;
      type: string;
    };
    assignee?: {
      id: string;
      name: string;
      email: string;
    };
    team?: {
      id: string;
      name: string;
    };
    project?: {
      id: string;
      name: string;
    };
    priority?: number;
    labels?: Array<{
      id: string;
      name: string;
      color: string;
      parentId?: string;
    }>;
    createdAt: string;
    updatedAt: string;
  };
  type: 'Cycle' | 'Issue' | 'Project' | 'Comment';
  organizationId: string;
  webhookTimestamp: number;
  webhookId: string;
  updatedFrom?: {
    stateId?: string;
    updatedAt?: string;
    sortOrder?: number;
    startedAt?: string;
  };
}

export interface LinearWebhookContext {
  type: string;
  payload: LinearWebhookPayload;
  headers: Record<string, string>;
}

export interface LinearIssueState {
  id: string;
  name: string;
  type: string;
  color?: string;
  position?: number;
}

export interface LinearIssue {
  id: string;
  title: string;
  description?: string;
  url?: string;
  identifier?: string;
  estimate?: number; // Story points
  state: LinearIssueState;
  assignee?: {
    id: string;
    name: string;
    email?: string;
  };
  labels?: Array<{
    id: string;
    name: string;
    color: string;
    parentId?: string;
  }>;
  team?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseChangeContext {
  issueId: string;
  issueTitle: string;
  labelName: string;
  labelId: string;
  previousState?: LinearIssueState;
  currentState?: LinearIssueState;
  organizationId: string;
}
