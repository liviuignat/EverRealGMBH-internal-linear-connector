# Fireman Validation Slack Notifications

## Overview

The issue processor now automatically sends Slack notifications when urgent issues are transitioned to "Fireman Validation" status. This ensures immediate visibility for critical issues requiring urgent attention.

## How It Works

### Trigger Conditions

The Slack notification is sent when **both** conditions are met:

1. **Status**: Issue state is "Fireman Validation" (case-insensitive)
2. **Priority**: Issue priority is "Urgent" (Linear priority level 1)

### Supported Actions

The system monitors these Linear webhook events:
- **Issue Creation**: When a new issue is created with Fireman Validation status and Urgent priority
- **Issue Updates**: When an existing issue is updated to meet the criteria

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# Slack Configuration
SLACK_FIREMAN_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

**Required**: The Slack webhook URL for sending notifications. Without this, notifications will be skipped with a warning in the logs.

### Slack Webhook Setup

1. **Create Slack App**:
   - Go to [Slack API](https://api.slack.com/apps)
   - Create a new app for your workspace

2. **Enable Incoming Webhooks**:
   - Navigate to "Incoming Webhooks" in your app settings
   - Toggle "Activate Incoming Webhooks" to On
   - Click "Add New Webhook to Workspace"

3. **Configure Channel**:
   - Select the channel where you want notifications
   - Copy the webhook URL to your environment variables

## Message Format

Slack notifications include:

```
🚨 A ticket was transitioned to Fireman Validation: [Issue Title](https://linear.app/issue/ISSUE_ID)
```

**Features**:
- **Fire emoji** (🚨) for immediate visual attention
- **Clickable link** to the Linear issue
- **Issue title** for context

## Logging

The system provides comprehensive logging for monitoring and debugging:

### Success Logs
```json
{
  "severity": "INFO",
  "module": "slack-notification",
  "issueId": "issue_123",
  "issueTitle": "Critical bug fix",
  "issueUrl": "https://linear.app/issue/issue_123",
  "msg": "Successfully sent Fireman Validation Slack notification"
}
```

### Debug Logs
```json
{
  "severity": "DEBUG",
  "module": "fireman-validation-check",
  "issueId": "issue_123",
  "currentState": "Fireman Validation",
  "priority": 1,
  "isFiremanValidation": true,
  "isUrgent": true,
  "msg": "Checking Fireman Validation criteria"
}
```

### Error Logs
```json
{
  "severity": "ERROR",
  "module": "slack-notification",
  "issueId": "issue_123",
  "status": 400,
  "statusText": "Bad Request",
  "errorText": "invalid_payload",
  "msg": "Failed to send Slack notification"
}
```

## Priority Mapping

Linear priority levels:
- **1** = Urgent (triggers notification)
- **2** = High
- **3** = Medium
- **4** = Low

## Implementation Details

### Key Components

1. **Criteria Check** (`checkFiremanValidationCriteria`):
   - Validates state name (case-insensitive)
   - Checks priority level
   - Logs validation process

2. **Slack Notification** (`sendFiremanValidationSlackNotification`):
   - Sends HTTP POST to Slack webhook
   - Formats message with issue details
   - Handles errors gracefully

3. **Integration Points**:
   - Called on both `create` and `update` actions
   - Runs independently of other processors
   - Non-blocking error handling

### Error Handling

- **Missing Webhook URL**: Warning logged, notification skipped
- **Slack API Errors**: Error logged with response details
- **Network Issues**: Error logged with stack trace
- **Invalid Responses**: Status code and error text logged

## Testing

### Manual Testing

1. **Create Test Issue**:
   - Set status to "Fireman Validation"
   - Set priority to "Urgent"
   - Verify Slack notification received

2. **Update Existing Issue**:
   - Change status to "Fireman Validation"
   - Set priority to "Urgent"
   - Verify notification sent

### Monitoring

Check Vercel logs for:
- Successful notification confirmations
- Webhook validation results
- Error details if notifications fail

## Troubleshooting

### Common Issues

1. **No Notifications Received**:
   - Verify `SLACK_FIREMAN_WEBHOOK_URL` is set correctly
   - Check Slack webhook is active and valid
   - Ensure issue meets both criteria (status + priority)

2. **Webhook Errors**:
   - Verify Slack app permissions
   - Check webhook URL format
   - Test webhook URL manually with curl

3. **Missing Priority**:
   - Linear priority must be explicitly set
   - Default/unset priority won't trigger notifications

4. **Case Sensitivity**:
   - Status comparison is case-insensitive
   - "fireman validation", "Fireman Validation", "FIREMAN VALIDATION" all work

### Debug Commands

Test webhook URL:
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test message"}' \
  YOUR_SLACK_WEBHOOK_URL
```

## Security Considerations

- **Webhook URL Protection**: Keep Slack webhook URL secure in environment variables
- **Message Content**: Only issue title and ID are included (no sensitive data)
- **Error Logging**: Webhook URL is not logged in error messages

---

*This feature ensures critical "Fireman Validation" issues receive immediate team attention through Slack notifications.*