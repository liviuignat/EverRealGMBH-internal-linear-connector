import { createApiLogger } from '../logger';

interface SliteDocument {
  id: string;
  title: string;
  content: string;
  release_status?: string;
  release_at?: string;
  created_at: string;
  updated_at: string;
}

interface PageResponse<T> {
  nextCursor: null;
  hasNextPage: false;
  total: number;
  notes: T[];
}

interface SliteCollectionDocument {
  id: string;
  title: string;
  parentNoteId?: string;
  url?: string;
  markdown?: string;
  note?: {
    id: string;
    title: string;
    markdown: string;
  };
}

class SliteAPI {
  private apiKey: string;
  private baseUrl = 'https://api.slite.com/v1';
  private collectionId = 'Bg5eYBZU2CgDoY';
  private log = createApiLogger('slite');

  constructor() {
    this.apiKey = process.env.SLITE_API_KEY || '';
    if (!this.apiKey) {
      this.log.warn('SLITE_API_KEY not configured');
    }
  }

  private async apiRequest(endpoint: string, options: RequestInit = {}) {
    if (!this.apiKey) {
      throw new Error('Slite API key not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-slite-api-key': `${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Slite API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  async getDocumentsFromCollection(): Promise<
    PageResponse<SliteCollectionDocument>
  > {
    try {
      const data = await this.apiRequest(
        `/notes/${this.collectionId}/children`
      );
      return data;
    } catch (error) {
      this.log.error(
        {
          collectionId: this.collectionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error fetching documents from Slite collection'
      );
      return {
        nextCursor: null,
        hasNextPage: false,
        total: 0,
        notes: [],
      };
    }
  }

  async getDocumentByTitle(title: string): Promise<SliteDocument | null> {
    try {
      const documents = await this.getDocumentsFromCollection();
      const document = documents.notes.find(
        (doc) => doc.title?.toLowerCase() === title.toLowerCase()
      );

      if (!document) {
        return null;
      }

      // Get full document content
      const fullDoc = await this.apiRequest(`/notes/${document.id}`);
      return {
        id: document.id,
        title: document.title,
        content: fullDoc.content || '',
        created_at: fullDoc.created_at || '',
        updated_at: fullDoc.updated_at || '',
        ...this.parseDocumentMetadata(fullDoc.content || ''),
      };
    } catch (error) {
      this.log.error(
        {
          title,
          collectionId: this.collectionId,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching document "${title}" from Slite`
      );
      return null;
    }
  }

  private parseDocumentMetadata(content: string): {
    release_status?: string;
    release_at?: string;
  } {
    const frontMatter = content;
    const metadata: { release_status?: string; release_at?: string } = {};

    const statusMatch = frontMatter.match(/release_status:\s*(.+)/);
    if (statusMatch) {
      metadata.release_status = statusMatch[1].trim();
    }

    const releaseMatch = frontMatter.match(/release_at:\s*(.+)/);
    if (releaseMatch) {
      metadata.release_at = releaseMatch[1].trim();
    }

    return metadata;
  }

  async createDocument(
    title: string,
    content: string
  ): Promise<SliteDocument | null> {
    try {
      const response = await this.apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title,
          markdown: content,
          parentNoteId: this.collectionId,
        }),
      });

      return {
        id: response.id,
        title: response.title,
        content: response.content || content,
        created_at: response.created_at,
        updated_at: response.updated_at,
        ...this.parseDocumentMetadata(content),
      };
    } catch (error) {
      this.log.error(
        {
          title,
          collectionId: this.collectionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error creating document in Slite'
      );
      return null;
    }
  }

  async updateDocument(
    documentId: string,
    content: string
  ): Promise<SliteDocument | null> {
    try {
      const response = await this.apiRequest(`/notes/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify({
          markdown: content,
        }),
      });

      return {
        id: response.id,
        title: response.title,
        content: response.markdown || content,
        created_at: response.created_at,
        updated_at: response.updated_at,
        ...this.parseDocumentMetadata(content),
      };
    } catch (error) {
      this.log.error(
        {
          documentId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error updating document in Slite'
      );
      return null;
    }
  }

  formatReleaseDocument(
    labelName: string,
    releaseDate: string,
    status: string,
    tickets: Array<{
      id: string;
      title: string;
      state: string;
      url?: string;
      identifier?: string;
      estimate?: number; // Story points
      assignee?: {
        id: string;
        name: string;
        email?: string;
      };
    }>
  ): string {
    // Calculate total story points
    const totalStoryPoints = tickets.reduce(
      (sum, ticket) => sum + (ticket.estimate || 0),
      0
    );

    // Create main tickets table with story points
    const tableHeader =
      '| State | Story Points | Ticket |\n|--------|--------------|--------|';

    // Create table rows
    const ticketRows = tickets
      .map((ticket) => {
        const titleCell = ticket.url
          ? `[[${ticket.identifier}] ${ticket.title}](${ticket.url})`
          : ticket.title;
        const storyPoints = ticket.estimate || 0;
        return `| ${ticket.state?.toLowerCase() === 'done' ? '✅' : '❌'} ${
          ticket.state
        } | ${storyPoints} | ${titleCell} |`;
      })
      .join('\n');

    const ticketTable =
      tickets.length > 0
        ? `${tableHeader}\n${ticketRows}`
        : 'No tickets found.';

    // Generate summary tables by assignee
    const { storyPointsTable, percentageTable } =
      this.generateStoryPointsTables(tickets);

    return `
__________
release_status: ${status}
release_at: ${releaseDate}
__________

# ${labelName} Release overview

**Total Story Points: ${totalStoryPoints}**

### Tickets

${ticketTable}

### Story Points by Assignee

${storyPointsTable}

### Story Points Completion Percentages

${percentageTable}

Generated: ${new Date().toISOString()}
`;
  }

  private generateStoryPointsTables(
    tickets: Array<{
      id: string;
      title: string;
      state: string;
      estimate?: number;
      assignee?: {
        id: string;
        name: string;
        email?: string;
      };
    }>
  ): { storyPointsTable: string; percentageTable: string } {
    if (tickets.length === 0) {
      return {
        storyPointsTable: 'No tickets found.',
        percentageTable: 'No tickets found.',
      };
    }

    // Define the states we want to track
    const states = ['Todo', 'In Progress', 'DEV Review', 'QA Testing', 'Done'];

    // Group story points by assignee
    const assigneeStats = new Map<string, Record<string, number>>();
    const totals = states.reduce(
      (acc, state) => ({ ...acc, [state]: 0 }),
      {} as Record<string, number>
    );

    tickets.forEach((ticket) => {
      const assigneeName = ticket.assignee?.name || 'Unassigned';
      const state = ticket.state;
      const storyPoints = ticket.estimate || 0;

      if (!assigneeStats.has(assigneeName)) {
        assigneeStats.set(
          assigneeName,
          states.reduce(
            (acc, s) => ({ ...acc, [s]: 0 }),
            {} as Record<string, number>
          )
        );
      }

      const stats = assigneeStats.get(assigneeName)!;
      if (states.includes(state)) {
        stats[state] += storyPoints;
        totals[state] += storyPoints;
      }
    });

    // Create story points table
    const storyPointsHeader =
      '| Person | Todo | In Progress | DEV Review | QA Testing | Done | Total |\n|--------|------|-------------|------------|------------|------|-------|';

    const storyPointsRows = Array.from(assigneeStats.entries())
      .map(([assignee, stats]) => {
        const assigneeTotal = Object.values(stats).reduce(
          (sum, points) => sum + points,
          0
        );
        const storyPointsCells = states.map((state) => stats[state] || 0);
        return `| ${assignee} | ${storyPointsCells.join(
          ' | '
        )} | ${assigneeTotal} |`;
      })
      .join('\n');

    // Add totals row for story points
    const grandTotal = Object.values(totals).reduce(
      (sum, points) => sum + points,
      0
    );
    const totalStoryPointsCells = states.map((state) => totals[state] || 0);
    const storyPointsTotalRow = `| **Total** | ${totalStoryPointsCells.join(
      ' | '
    )} | **${grandTotal}** |`;

    const storyPointsTable = `${storyPointsHeader}\n${storyPointsRows}\n${storyPointsTotalRow}`;

    // Create percentages table
    const percentageHeader =
      '| Person | Todo % | In Progress % | DEV Review % | QA Testing % | Done % |\n|--------|--------|---------------|--------------|--------------|--------|';

    const percentageRows = Array.from(assigneeStats.entries())
      .map(([assignee, stats]) => {
        const assigneeTotal = Object.values(stats).reduce(
          (sum, points) => sum + points,
          0
        );
        if (assigneeTotal === 0) return '';

        const percentages = states.map((state) => {
          const percentage = (
            ((stats[state] || 0) / assigneeTotal) *
            100
          ).toFixed(1);
          return `${percentage}%`;
        });

        return `| ${assignee} | ${percentages.join(' | ')} |`;
      })
      .filter((row) => row)
      .join('\n');

    // Add totals row for percentages
    const totalPercentages = states.map((state) => {
      const percentage =
        grandTotal > 0
          ? (((totals[state] || 0) / grandTotal) * 100).toFixed(1)
          : '0.0';
      return `${percentage}%`;
    });

    const percentageTotalRow = `| **Total** | ${totalPercentages.join(
      ' | '
    )} |`;

    const percentageTable = `${percentageHeader}\n${percentageRows}\n${percentageTotalRow}`;

    return { storyPointsTable, percentageTable };
  }

  private generateSummaryTable(): string {
    // This method is now deprecated in favor of generateStoryPointsTables
    // but keeping it for backward compatibility
    return '';
  }
}

export const sliteApi = new SliteAPI();
