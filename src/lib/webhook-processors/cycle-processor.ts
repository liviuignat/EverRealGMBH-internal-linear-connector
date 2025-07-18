import { LinearWebhookPayload } from '../types/linear-webhook';
import { linearApi } from '../api/linear-api';
import { sliteApi } from '../api/slite-api';
import { createLogger } from '../logger';

const RETROSPECTIVE_NODE_ID = process.env.SLITE_RETRO_COLLECTION_ID || '';

interface CycleIssue {
  id: string;
  title: string;
  identifier: string;
  url: string;
  estimate?: number;
  state: {
    id: string;
    name: string;
    type: string;
  };
  assignee?: {
    id: string;
    name: string;
    email?: string;
  };
  comments?: Array<{
    id: string;
    body: string;
    user: {
      name: string;
    };
    createdAt: string;
  }>;
  reopenedCount?: number;
}

interface CycleData {
  id: string;
  title?: string;
  name?: string;
  completedAt?: string;
  startsAt?: string;
  endsAt?: string;
}

interface AssigneeStats {
  name: string;
  totalStoryPoints: number;
  statusBreakdown: Record<string, number>; // status -> story points
  statusPercentages: Record<string, number>; // status -> percentage
}

export async function processCycleWebhook(payload: LinearWebhookPayload) {
  const { action, data } = payload;
  const log = createLogger('cycle-processor', {
    cycleId: data.id,
    action,
    organizationId: payload.organizationId,
  });

  log.info(
    {
      cycleId: data.id,
      cycleTitle: data.title,
      action,
    },
    `Processing cycle webhook: ${action}`
  );

  // Only process when cycle is completed/closed
  const cycleData = data as unknown as CycleData;
  // if (action === 'update' && cycleData.completedAt) {
  console.log('---> cycleData', action === 'update', cycleData.completedAt);
  if (action === 'update') {
    log.info(
      {
        cycleId: cycleData.id,
        cycleName: cycleData.title,
        completedAt: cycleData.completedAt,
      },
      'Cycle completed, generating retrospective'
    );

    try {
      await generateCycleRetrospective(cycleData);
      return {
        success: true,
        action: 'retrospective-created',
        cycleId: cycleData.id,
      };
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          cycleId: cycleData.id,
          cycleName: cycleData.title,
        },
        'Error generating cycle retrospective'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cycleId: cycleData.id,
      };
    }
  }

  return { success: true, action, cycleId: data.id };
}

async function generateCycleRetrospective(cycleData: CycleData) {
  const log = createLogger('cycle-retrospective', { cycleId: cycleData.id });
  const cycleName =
    cycleData.title || cycleData.name || `Cycle-${cycleData.id}`;
  const retrospectiveTitle = `Retrospective-${cycleName}`;

  log.info({ cycleName, retrospectiveTitle }, 'Generating cycle retrospective');

  // 1. Fetch all issues in the cycle
  const cycleIssues = await fetchCycleIssues(cycleData.id);
  log.info({ issueCount: cycleIssues.length }, 'Fetched cycle issues');

  // 2. Fetch comments for each issue and analyze them
  const issuesWithAnalysis = await analyzeIssuesAndComments(cycleIssues);

  // 3. Calculate assignee statistics
  const assigneeStats = calculateAssigneeStats(issuesWithAnalysis);

  // 4. Generate content
  const retrospectiveContent = generateRetrospectiveContent(
    cycleName,
    cycleData,
    issuesWithAnalysis,
    assigneeStats
  );

  // 5. Check if retrospective document already exists in the specified node
  const existingDoc = await sliteApi.getDocumentByTitleInNode(
    retrospectiveTitle,
    RETROSPECTIVE_NODE_ID
  );

  if (existingDoc) {
    log.info(
      { documentId: existingDoc.id },
      'Updating existing retrospective document'
    );
    const result = await sliteApi.updateDocument(
      existingDoc.id,
      retrospectiveContent
    );
    return result;
  } else {
    log.info('Creating new retrospective document in specified node');
    const result = await sliteApi.createDocumentInNode(
      retrospectiveTitle,
      retrospectiveContent,
      RETROSPECTIVE_NODE_ID
    );
    return result;
  }
}

async function fetchCycleIssues(cycleId: string): Promise<CycleIssue[]> {
  const log = createLogger('cycle-issues-fetch', { cycleId });

  try {
    const issues = await linearApi.getIssuesByCycle(cycleId);

    // Convert LinearIssue to CycleIssue format
    return issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      identifier: issue.identifier || issue.id,
      url:
        issue.url || `https://linear.app/issue/${issue.identifier || issue.id}`,
      estimate: issue.estimate,
      state: issue.state,
      assignee: issue.assignee,
      comments: [], // Will be populated later
      reopenedCount: 0, // Will be calculated from comments
    }));
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        cycleId,
      },
      'Error fetching cycle issues'
    );
    return [];
  }
}

async function analyzeIssuesAndComments(
  issues: CycleIssue[]
): Promise<CycleIssue[]> {
  const log = createLogger('issue-analysis');

  for (const issue of issues) {
    log.debug({ issueId: issue.id }, 'Analyzing issue comments');

    try {
      // Fetch comments for each issue
      const comments = await linearApi.getIssueComments(issue.id);
      issue.comments = comments;

      // Analyze comments to count reopening events
      // Look for patterns like "reopened", "back to", "moved to Todo/In Progress"
      const reopenKeywords = [
        'reopened',
        'back to todo',
        'back to in progress',
        'moved to todo',
        'moved to in progress',
        'reverted',
        'rolled back',
      ];

      issue.reopenedCount = comments.filter((comment) =>
        reopenKeywords.some((keyword) =>
          comment.body.toLowerCase().includes(keyword.toLowerCase())
        )
      ).length;

      log.debug(
        {
          issueId: issue.id,
          commentCount: comments.length,
          reopenedCount: issue.reopenedCount,
        },
        'Analyzed issue comments'
      );
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          issueId: issue.id,
        },
        'Error analyzing issue comments'
      );

      issue.comments = [];
      issue.reopenedCount = 0;
    }
  }

  return issues;
}

function calculateAssigneeStats(issues: CycleIssue[]): AssigneeStats[] {
  const assigneeMap = new Map<string, AssigneeStats>();

  for (const issue of issues) {
    const assigneeName = issue.assignee?.name || 'Unassigned';
    const storyPoints = issue.estimate || 0;
    const status = issue.state.name;

    if (!assigneeMap.has(assigneeName)) {
      assigneeMap.set(assigneeName, {
        name: assigneeName,
        totalStoryPoints: 0,
        statusBreakdown: {},
        statusPercentages: {},
      });
    }

    const stats = assigneeMap.get(assigneeName)!;
    stats.totalStoryPoints += storyPoints;
    stats.statusBreakdown[status] =
      (stats.statusBreakdown[status] || 0) + storyPoints;
  }

  // Calculate percentages
  for (const stats of assigneeMap.values()) {
    for (const [status, points] of Object.entries(stats.statusBreakdown)) {
      stats.statusPercentages[status] =
        stats.totalStoryPoints > 0
          ? (points / stats.totalStoryPoints) * 100
          : 0;
    }
  }

  return Array.from(assigneeMap.values()).sort(
    (a, b) => b.totalStoryPoints - a.totalStoryPoints
  );
}

function generateRetrospectiveContent(
  cycleName: string,
  cycleData: CycleData,
  issues: CycleIssue[],
  assigneeStats: AssigneeStats[]
): string {
  const totalStoryPoints = issues.reduce(
    (sum, issue) => sum + (issue.estimate || 0),
    0
  );
  const completedStoryPoints = issues
    .filter((issue) => issue.state.type === 'completed')
    .reduce((sum, issue) => sum + (issue.estimate || 0), 0);

  const completionRate =
    totalStoryPoints > 0 ? (completedStoryPoints / totalStoryPoints) * 100 : 0;

  const reopenedIssues = issues.filter(
    (issue) => (issue.reopenedCount || 0) > 0
  );
  const totalReopened = reopenedIssues.length;

  const content = `__________
cycle_id: ${cycleData.id}
cycle_name: ${cycleName}
completed_at: ${cycleData.completedAt || new Date().toISOString().split('T')[0]}
__________

# ${cycleName} - Cycle Retrospective

**Cycle Period:** ${cycleData.startsAt || 'N/A'} - ${cycleData.endsAt || 'N/A'}
**Total Story Points:** ${totalStoryPoints}
**Completed Story Points:** ${completedStoryPoints}
**Completion Rate:** ${completionRate.toFixed(1)}%
**Total Issues:** ${issues.length}
**Reopened Issues:** ${totalReopened}

## 📊 Issues by Person and Status

| Person | Status | Story Points | Ticket |
|--------|--------|-------------|--------|
${issues
  .map((issue) => {
    const assignee = issue.assignee?.name || 'Unassigned';
    const statusIcon = issue.state.type === 'completed' ? '✅' : '❌';
    const ticketLink = `[${issue.identifier}] ${issue.title}`;
    return `| ${assignee} | ${statusIcon} ${issue.state.name} | ${
      issue.estimate || 0
    } | [${ticketLink}](${issue.url}) |`;
  })
  .join('\n')}

## 📈 Story Points by Assignee

| Person | Todo | In Progress | Review | Done | Total | Completion % |
|--------|------|-------------|---------|------|-------|-------------|
${assigneeStats
  .map((stats) => {
    const todo = stats.statusBreakdown['Todo'] || 0;
    const inProgress = stats.statusBreakdown['In Progress'] || 0;
    const review =
      stats.statusBreakdown['Review'] ||
      stats.statusBreakdown['In Review'] ||
      0;
    const done =
      stats.statusBreakdown['Done'] || stats.statusBreakdown['Completed'] || 0;
    const completionPct =
      stats.statusPercentages['Done'] ||
      stats.statusPercentages['Completed'] ||
      0;

    return `| ${stats.name} | ${todo} | ${inProgress} | ${review} | ${done} | ${
      stats.totalStoryPoints
    } | ${completionPct.toFixed(1)}% |`;
  })
  .join('\n')}

## 🔄 Reopened Issues Analysis

${
  totalReopened === 0
    ? '✅ **No issues were reopened during this cycle.**'
    : `⚠️ **${totalReopened} issues were reopened:**

${reopenedIssues
  .map(
    (issue) =>
      `- [${issue.identifier}] ${issue.title} (reopened ${issue.reopenedCount} times)`
  )
  .join('\n')}

### Potential Reasons for Reopening:
- Quality assurance issues
- Incomplete requirements
- Technical debt
- Integration problems
- Missing edge cases`
}

## 💬 Common Issues from Comments

_Analysis of issue comments to identify recurring problems:_

${
  issues.length === 0
    ? 'No issues to analyze.'
    : `Based on ${issues.length} issues analyzed:

- **Recurring Themes:** TBD (requires comment analysis implementation)
- **Technical Blockers:** TBD
- **Process Issues:** TBD
- **Communication Gaps:** TBD

> Note: To enable advanced comment analysis, integrate with Claude API to process comments and identify:
> - Common technical issues mentioned
> - Recurring blockers or dependencies
> - Communication patterns that led to delays
> - Quality issues that caused reopenings

**Comments Summary:**
${issues
  .filter((issue) => issue.comments && issue.comments.length > 0)
  .map(
    (issue) =>
      '- **' +
      issue.identifier +
      '**: ' +
      (issue.comments?.length || 0) +
      ' comments'
  )
  .slice(0, 10)
  .join('\\n')}`
}

## 🎯 Recommendations

1. **Quality Focus:** ${
    completionRate < 80
      ? 'Consider implementing more thorough testing before marking issues as complete.'
      : 'Good completion rate - maintain current quality standards.'
  }

2. **Reopened Issues:** ${
    totalReopened > 0
      ? 'Review the root causes of reopened issues and implement preventive measures.'
      : 'Excellent - no reopened issues this cycle.'
  }

3. **Story Point Distribution:** Review workload balance across team members for future cycles.

4. **Process Improvements:** Based on comment analysis, focus on areas with the most communication or technical challenges.

---

Generated: ${new Date().toISOString()}
Cycle ID: ${cycleData.id}
`;

  return content;
}
