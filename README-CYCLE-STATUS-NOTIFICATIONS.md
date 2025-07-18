# Cycle Status Slack Notifications

## Overview

The issue processor automatically sends Slack notifications when issues in active cycles reach important milestones or are flagged for attention. This helps teams stay informed about progress and issues that need immediate attention during active development cycles.

## How It Works

### Trigger Conditions

Slack notifications are sent when **all** of the following conditions are met:

1. **Active Cycle**: Issue is assigned to an active (not completed) cycle
2. **Status/Label Criteria**: Issue meets one of these conditions:
   - Moved to "QA Testing" status
   - Moved to "Done" status
   - Tagged with "🔴 FLAGGED" label

### Supported Actions

The system monitors Linear webhook events for issue updates and checks for the above criteria.

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# Slack Configuration
SLACK_CYCLE_STATUS_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/CYCLE/WEBHOOK
```

**Required**: The Slack webhook URL for sending cycle status notifications. Without this, notifications will be skipped with a warning in the logs.

### Slack Webhook Setup

1. **Create Slack App** (if not already done):
   - Go to [Slack API](https://api.slack.com/apps)
   - Create a new app for your workspace

2. **Enable Incoming Webhooks**:
   - Navigate to "Incoming Webhooks" in your app settings
   - Toggle "Activate Incoming Webhooks" to On
   - Click "Add New Webhook to Workspace"

3. **Configure Channel**:
   - Select the channel where you want cycle status notifications
   - Copy the webhook URL to your environment variables

## Message Formats

### QA Testing / Done Status
```
✅ Issue moved to "QA Testing" in active cycle "Sprint 24.1": [DEV-123 Fix critical bug](https://linear.app/issue/DEV-123)
```

### Flagged Issues
```
🚩 Issue flagged in active cycle "Sprint 24.1": [DEV-456 Performance issue](https://linear.app/issue/DEV-456)
```

**Features**:
- **Status-specific emojis**: ✅ for progress, 🚩 for flagged issues
- **Cycle context**: Shows which active cycle the issue belongs to
- **Clickable links**: Direct links to Linear issues
- **Issue numbers**: Linear identifier for easy reference

## Logging

The system provides comprehensive logging for monitoring and debugging:

### Success Logs
```json
{
  "severity": "INFO",
  "module": "slack-cycle-notification",
  "issueId": "issue_123",
  "issueNumber": "DEV-123",
  "issueTitle": "Fix critical bug",
  "issueUrl": "https://linear.app/issue/issue_123",
  "statusOrLabel": "QA Testing",
  "cycleName": "Sprint 24.1",
  "msg": "Successfully sent cycle status Slack notification"
}
```

### Debug Logs
```json
{
  "severity": "DEBUG",
  "module": "cycle-status-check",
  "issueId": "issue_123",
  "currentState": "QA Testing",
  "isQATesting": true,
  "isDone": false,
  "isFlagged": false,
  "cycleName": "Sprint 24.1",
  "cycleId": "cycle_456",
  "msg": "Checking cycle status criteria"
}
```

### Cycle Validation Logs
```json
{
  "severity": "DEBUG",
  "module": "cycle-status-check",
  "issueId": "issue_123",
  "cycleId": "cycle_456",
  "cycleName": "Sprint 24.1",
  "completedAt": null,
  "msg": "Issue is in completed cycle, skipping notification"
}
```

## Status Mapping

### Linear Status Names (Case-Insensitive)
- **"QA Testing"** → Triggers notification ✅
- **"Done"** → Triggers notification ✅

### Label Names (Exact Match)
- **"🔴 FLAGGED"** → Triggers notification 🚩

### Cycle States
- **Active Cycle**: `completedAt` is null or undefined
- **Completed Cycle**: `completedAt` has a timestamp (no notifications)

## Implementation Details

### Key Components

1. **Cycle Validation** (`checkCycleStatusCriteria`):
   - Fetches cycle details from Linear API
   - Validates cycle is active (not completed)
   - Checks status and label criteria

2. **Slack Notification** (`sendCycleStatusSlackNotification`):
   - Sends HTTP POST to Slack webhook
   - Formats messages based on trigger type
   - Handles errors gracefully

3. **Integration Points**:
   - Called on issue `update` actions only
   - Runs independently of other processors
   - Non-blocking error handling

### Linear API Integration

**New Method**: `getCycleDetails(cycleId: string)`
- Fetches cycle information including completion status
- Returns cycle name, dates, and completion state
- Used to validate if cycle is active

**GraphQL Query**:
```graphql
query GetCycleDetails($cycleId: ID!) {
  cycle(id: $cycleId) {
    id
    name
    completedAt
    startsAt
    endsAt
  }
}
```

## Error Handling

- **Missing Webhook URL**: Warning logged, notification skipped
- **Invalid Cycle ID**: Debug log, notification skipped
- **API Errors**: Error logged with cycle context
- **Network Issues**: Error logged with stack trace
- **Completed Cycles**: Debug log, notification skipped appropriately

## Testing

### Manual Testing

1. **QA Testing Status**:
   - Assign issue to active cycle
   - Move issue to "QA Testing" status
   - Verify Slack notification received

2. **Done Status**:
   - Assign issue to active cycle
   - Move issue to "Done" status
   - Verify notification sent

3. **Flagged Label**:
   - Assign issue to active cycle
   - Add "🔴 FLAGGED" label
   - Verify flagged notification sent

4. **Completed Cycle** (Negative Test):
   - Move issue in completed cycle
   - Verify no notification sent

### Monitoring

Check Vercel logs for:
- Cycle status validation results
- Successful notification confirmations
- Cycle completion status checks
- Error details if notifications fail

## Troubleshooting

### Common Issues

1. **No Notifications Received**:
   - Verify `SLACK_CYCLE_STATUS_WEBHOOK_URL` is set correctly
   - Ensure issue is assigned to an active cycle
   - Check issue meets status/label criteria
   - Verify cycle is not completed

2. **Wrong Cycle Detection**:
   - Ensure Linear webhook includes cycle information
   - Check Linear API permissions for cycle data
   - Verify cycle ID is valid

3. **Status Not Detected**:
   - Status names are case-insensitive ("qa testing" works)
   - Label names are case-sensitive ("🔴 FLAGGED" exact match)
   - Check exact spelling in Linear

4. **Completed Cycle Issues**:
   - System correctly skips notifications for completed cycles
   - Check cycle completion date in Linear
   - Review debug logs for cycle validation

### Debug Commands

Test webhook URL:
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"✅ Test cycle status notification"}' \
  YOUR_SLACK_WEBHOOK_URL
```

## Performance Considerations

- **API Efficiency**: One additional GraphQL call per issue update to fetch cycle details
- **Caching**: Consider implementing cycle status caching for high-volume environments
- **Error Boundaries**: Independent execution doesn't affect other webhook processing

## Security Considerations

- **Webhook URL Protection**: Keep Slack webhook URL secure in environment variables
- **Data Exposure**: Only cycle name, issue title, and identifier are shared
- **Error Logging**: Sensitive information not logged in error messages

## Future Enhancements

- **Cycle Progress Tracking**: Aggregate notifications for cycle completion percentages
- **Team Mentions**: Tag specific team members based on assignee or team
- **Custom Status Mapping**: Configurable status names beyond "QA Testing" and "Done"
- **Cycle Milestones**: Additional notifications for cycle start/end events

---

*This feature helps teams stay informed about critical progress milestones and issues requiring attention during active development cycles.*