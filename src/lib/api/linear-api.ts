import { LinearIssueState, LinearIssue } from '../types/linear-webhook';
import { createApiLogger } from '../logger';

interface GraphQLIssueResponse {
  id: string;
  title: string;
  description?: string;
  url?: string;
  identifier?: string;
  estimate?: number; // Story points
  state: {
    id: string;
    name: string;
    type: string;
    color?: string;
    position?: number;
  };
  assignee?: {
    id: string;
    name: string;
    email?: string;
  };
  labels: {
    nodes: Array<{
      id: string;
      name: string;
      color: string;
      parent?: {
        id: string;
      };
    }>;
  };
  team?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface GraphQLLabelResponse {
  id: string;
  name: string;
  color: string;
  parent?: {
    id: string;
  };
}

class LinearAPI {
  private apiKey: string;
  private baseUrl = 'https://api.linear.app/graphql';
  private log = createApiLogger('linear');

  constructor() {
    this.apiKey = process.env.LINEAR_API_KEY || '';
    if (!this.apiKey) {
      this.log.warn('LINEAR_API_KEY not configured');
    }
  }

  private async graphqlRequest(
    query: string,
    variables?: Record<string, unknown>
  ) {
    if (!this.apiKey) {
      throw new Error('Linear API key not configured');
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.log.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText,
          query: query.substring(0, 100), // Log first 100 chars of query
        },
        'Linear API request failed'
      );
      throw new Error(errorText);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  async getIssueState(stateId: string): Promise<LinearIssueState | null> {
    const query = `
      query GetWorkflowState($id: String!) {
        workflowState(id: $id) {
          id
          name
          type
          color
          position
        }
      }
    `;

    try {
      const data = await this.graphqlRequest(query, { id: stateId });
      return data.workflowState;
    } catch (error) {
      this.log.error(
        {
          stateId,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching state ${stateId}`
      );
      return null;
    }
  }

  async getIssuesByLabel(labelId: string): Promise<LinearIssue[]> {
    const query = `
      query GetIssuesByLabel($labelId: ID!, $first: Int) {
        issues(
          filter: {
            labels: { id: { eq: $labelId } }
          }
          first: $first
        ) {
          nodes {
            id
            title
            description
            url
            identifier
            estimate
            state {
              id
              name
              type
              color
              position
            }
            assignee {
              id
              name
              email
            }
            labels {
              nodes {
                id
                name
                color
                parent {
                  id
                }
              }
            }
            team {
              id
              name
            }
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const data = await this.graphqlRequest(query, {
        labelId,
        first: 100, // Adjust as needed
      });

      return data.issues.nodes.map((issue: GraphQLIssueResponse) => ({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        identifier: issue.identifier,
        estimate: issue.estimate,
        state: issue.state,
        assignee: issue.assignee,
        labels: issue.labels.nodes.map((label: GraphQLLabelResponse) => ({
          id: label.id,
          name: label.name,
          color: label.color,
          parentId: label.parent?.id,
        })),
        team: issue.team,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }));
    } catch (error) {
      this.log.error(
        {
          labelId,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching issues for label ${labelId}`
      );
      return [];
    }
  }

  async getIssuesByLabelParent(parentLabelId: string): Promise<LinearIssue[]> {
    const query = `
      query GetIssuesByLabelParent($parentLabelId: String!, $first: Int) {
        issues(
          filter: {
            labels: { parent: { id: { eq: $parentLabelId } } }
          }
          first: $first
          orderBy: updatedAt
        ) {
          nodes {
            id
            title
            description
            url
            identifier
            estimate
            state {
              id
              name
              type
              color
              position
            }
            assignee {
              id
              name
              email
            }
            labels {
              nodes {
                id
                name
                color
                parent {
                  id
                }
              }
            }
            team {
              id
              name
            }
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const data = await this.graphqlRequest(query, {
        parentLabelId,
        first: 100,
      });

      return data.issues.nodes.map((issue: GraphQLIssueResponse) => ({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        identifier: issue.identifier,
        estimate: issue.estimate,
        state: issue.state,
        assignee: issue.assignee,
        labels: issue.labels.nodes.map((label: GraphQLLabelResponse) => ({
          id: label.id,
          name: label.name,
          color: label.color,
          parentId: label.parent?.id,
        })),
        team: issue.team,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }));
    } catch (error) {
      this.log.error(
        {
          parentLabelId,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching issues for parent label ${parentLabelId}`
      );
      return [];
    }
  }
  async getIssuesByCycle(cycleId: string): Promise<LinearIssue[]> {
    const query = `
      query GetIssuesByCycle($cycleId: ID!, $first: Int) {
        issues(
          filter: {
            cycle: { id: { eq: $cycleId } }
          }
          first: $first
        ) {
          nodes {
            id
            title
            description
            url
            identifier
            estimate
            state {
              id
              name
              type
              color
              position
            }
            assignee {
              id
              name
              email
            }
            labels {
              nodes {
                id
                name
                color
                parent {
                  id
                }
              }
            }
            team {
              id
              name
            }
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const data = await this.graphqlRequest(query, {
        cycleId,
        first: 100,
      });

      return data.issues.nodes.map((issue: GraphQLIssueResponse) => ({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        identifier: issue.identifier,
        estimate: issue.estimate,
        state: issue.state,
        assignee: issue.assignee,
        labels: issue.labels.nodes.map((label: GraphQLLabelResponse) => ({
          id: label.id,
          name: label.name,
          color: label.color,
          parentId: label.parent?.id,
        })),
        team: issue.team,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }));
    } catch (error) {
      this.log.error(
        {
          cycleId,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching issues for cycle ${cycleId}`
      );
      return [];
    }
  }

  async getIssueComments(issueId: string): Promise<
    Array<{
      id: string;
      body: string;
      user: { name: string };
      createdAt: string;
    }>
  > {
    const query = `
      query GetIssueComments($issueId: String!, $first: Int) {
        issue(id: $issueId) {
          comments(first: $first) {
            nodes {
              id
              body
              user {
                name
              }
              createdAt
            }
          }
        }
      }
    `;

    try {
      const data = await this.graphqlRequest(query, {
        issueId,
        first: 50,
      });

      return data.issue?.comments?.nodes || [];
    } catch (error) {
      this.log.error(
        {
          issueId,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching comments for issue ${issueId}`
      );
      return [];
    }
  }
}

export const linearApi = new LinearAPI();
