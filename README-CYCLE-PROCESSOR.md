# Cycle Processor - Automatic Retrospective Generation

## Overview

The cycle processor automatically generates comprehensive retrospective documents in Slite when Linear cycles are completed. It analyzes cycle data, issues, and comments to provide insights for team improvement.

## Features

### ✅ **Implemented**

1. **Cycle Completion Detection**
   - Monitors Linear cycle webhooks for completion events
   - Triggers retrospective generation when `action: 'update'` and `completedAt` is present

2. **Issue Analysis**
   - Fetches all issues in the completed cycle
   - Analyzes issue state transitions and assignments
   - Counts story points and completion rates

3. **Comment Analysis (Basic)**
   - Fetches comments for each issue
   - Detects reopening patterns using keyword matching
   - Counts reopened issues automatically

4. **Retrospective Document Generation**
   - Creates documents in specified Slite node (ID: `4SnpA93SeWWUKk`)
   - Uses naming convention: `Retrospective-{cycleName}`
   - Updates existing documents or creates new ones

5. **Comprehensive Tables**
   - Issues by person and status with clickable ticket links
   - Story points breakdown by assignee
   - Status percentages and completion rates
   - Reopened issues analysis

## Document Structure

Generated retrospectives include:

```markdown
# Cycle Name - Cycle Retrospective

**Cycle Period:** Start Date - End Date
**Total Story Points:** X
**Completed Story Points:** Y
**Completion Rate:** Z%
**Total Issues:** N
**Reopened Issues:** M

## 📊 Issues by Person and Status
| Person | Status | Story Points | Ticket |
|--------|--------|-------------|--------|
| Alice | ✅ Done | 5 | [DEV-123] Feature A |

## 📈 Story Points by Assignee
| Person | Todo | In Progress | Review | Done | Total | Completion % |
|--------|------|-------------|---------|------|-------|-------------|
| Alice | 2 | 3 | 1 | 8 | 14 | 57.1% |

## 🔄 Reopened Issues Analysis
- Lists issues that were reopened during the cycle
- Identifies potential causes

## 💬 Common Issues from Comments
- Basic comment summary by issue
- Framework for advanced analysis

## 🎯 Recommendations
- Automated recommendations based on cycle metrics
```

## Configuration

### Environment Variables
- `LINEAR_API_KEY`: Required for fetching cycle data and issues
- `SLITE_API_KEY`: Required for creating/updating retrospective documents

### Slite Node Configuration
- Default retrospective node ID: `4SnpA93SeWWUKk`
- Update `RETROSPECTIVE_NODE_ID` constant in `cycle-processor.ts` if needed

## Webhook Setup

Add cycle webhooks in Linear:
1. Go to Linear Settings → API → Webhooks
2. Create webhook pointing to: `https://your-domain.vercel.app/api/linear-webhook/cycle`
3. Select cycle events (especially cycle updates)

## Usage

The processor automatically runs when:
1. A cycle webhook is received with `action: 'update'`
2. The cycle data includes a `completedAt` timestamp
3. All required API keys are configured

## Future Enhancements

### 🚀 **Advanced Comment Analysis with Claude API**

To enable intelligent comment analysis, integrate with Claude API:

```typescript
// Example integration point in analyzeIssuesAndComments()
const claudeAnalysis = await analyzeWithClaude(issue.comments);
// Identify: recurring themes, blockers, quality issues, communication gaps
```

**Benefits:**
- Automatic identification of recurring technical issues
- Detection of communication patterns that cause delays
- Quality issue categorization
- Actionable insights from team discussions

### 📊 **Enhanced Metrics**

- Cycle velocity trends
- Burndown chart data generation
- Team performance comparisons
- Predictive analytics for future cycles

### 🔄 **Integration Enhancements**

- Slack notifications when retrospectives are generated
- Automatic scheduling of retrospective meetings
- Integration with team planning tools
- Export to other project management systems

### 🎯 **AI-Powered Recommendations**

- Specific process improvement suggestions
- Team workload optimization recommendations
- Quality improvement strategies
- Technical debt prioritization

## Implementation Details

### Key Files
- `src/lib/webhook-processors/cycle-processor.ts` - Main processor logic
- `src/lib/api/linear-api.ts` - Added cycle issue fetching methods
- `src/lib/api/slite-api.ts` - Added node-specific document methods
- `src/app/api/linear-webhook/[type]/route.ts` - Added cycle webhook routing

### Error Handling
- Comprehensive logging with Pino structured logging
- Graceful fallbacks for missing data
- Detailed error context for debugging

### Performance Considerations
- Efficient GraphQL queries for Linear API
- Minimal API calls through batching
- Proper error boundaries and timeouts

## Testing

The processor can be tested by:
1. Completing a cycle in Linear
2. Checking Vercel logs for processing confirmation
3. Verifying retrospective document creation in Slite
4. Reviewing document content and metrics accuracy

## Monitoring

Monitor the processor through:
- Vercel function logs
- Structured logging with contextual information
- Success/failure metrics in retrospective processing
- Document creation/update confirmations

## Troubleshooting

Common issues:
1. **No retrospective generated**: Check if cycle webhook includes `completedAt`
2. **Missing issues**: Verify Linear API permissions and cycle issue fetching
3. **Document creation fails**: Check Slite API key and node permissions
4. **Incomplete data**: Review Linear GraphQL query limits and pagination

---

*Generated retrospectives provide valuable insights for continuous team improvement and help identify patterns that impact delivery quality and velocity.*