# Linear Webhook Connector

A Next.js application that provides webhook endpoints to receive and process Linear ticket updates. Built with TypeScript and designed for easy deployment on Vercel.

## Features

- 🔗 Dynamic webhook endpoints: `/api/linear-webhook/{type}`
- 🔐 Webhook signature verification for security
- 📝 Comprehensive TypeScript types for Linear webhooks
- 🛡️ Error handling and logging
- 📋 **Release tracking**: Automatically creates/updates Slite documents when story tickets change status
- 🔄 **State change detection**: Monitors Linear issue state transitions
- 📊 **Auto-aggregation**: Collects all tickets with the same label for release notes
- 🚀 Ready for Vercel deployment
- ⚡ Built with Next.js 14 App Router

## Supported Webhook Types

- **Issue events** (`/api/linear-webhook/issue`) - Handle issue creation, updates, and removal
- **Comment events** (`/api/linear-webhook/comment`) - Process comment additions and changes
- **Project events** (`/api/linear-webhook/project`) - Track project updates
- **Team events** (`/api/linear-webhook/team`) - Monitor team changes
- **User events** (`/api/linear-webhook/user`) - Handle user-related events

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm, yarn, or pnpm
- A Linear workspace with admin access

### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo>
   cd internal-linear-connector
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Copy the example environment file
   cp env.example .env.local

   # Edit .env.local and add your Linear webhook secret
   # You can find this in Linear Settings → API → Webhooks
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Visit [http://localhost:3000](http://localhost:3000) to see the webhook connector interface.

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LINEAR_WEBHOOK_SECRET` | Secret for webhook signature verification | Optional but recommended |
| `LINEAR_API_KEY` | Linear API key for fetching issue states and data | Required for release tracking |
| `SLITE_API_KEY` | Slite API key for creating/updating release documents | Required for release tracking |
| `NEXT_PUBLIC_APP_URL` | Your app's URL for webhook configuration | Development only |

## Linear Webhook Configuration

1. **Access Linear Settings:**
   - Go to your Linear workspace
   - Navigate to Settings → API → Webhooks

2. **Create a new webhook:**
   - Click "Create webhook"
   - Set the URL to: `https://your-domain.vercel.app/api/linear-webhook/issue`
   - Choose the events you want to receive
   - Copy the webhook secret to your environment variables

3. **Configure events:**
   - Issue events (recommended)
   - Comment events
   - Project events
   - Any other events you need

## API Endpoints

### POST `/api/linear-webhook/{type}`

Receives Linear webhook events for the specified type.

**Parameters:**
- `type` (path parameter): The type of webhook (issue, comment, project, etc.)

**Headers:**
- `linear-signature`: Webhook signature for verification
- `linear-webhook-id`: Unique webhook identifier
- `linear-timestamp`: Webhook timestamp
- `Content-Type: application/json`

**Request Body:**
```json
{
  "action": "create|update|remove",
  "data": {
    "id": "issue-id",
    "title": "Issue title",
    "description": "Issue description",
    "state": {
      "id": "state-id",
      "name": "Todo",
      "type": "unstarted"
    },
    "assignee": {
      "id": "user-id",
      "name": "John Doe",
      "email": "john@example.com"
    }
  },
  "type": "Issue",
  "organizationId": "org-id",
  "webhookTimestamp": 1234567890,
  "webhookId": "webhook-id"
}
```

**Response:**
```json
{
  "success": true,
  "type": "issue",
  "result": {
    "success": true,
    "action": "create",
    "issueId": "issue-id"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET `/api/linear-webhook/{type}`

Test endpoint that returns information about the webhook endpoint.

## Deploying to Vercel

### Method 1: Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Set environment variables:**
   ```bash
   vercel env add LINEAR_WEBHOOK_SECRET
   ```

### Method 2: Vercel Dashboard

1. **Connect your repository:**
   - Go to [vercel.com](https://vercel.com)
   - Import your Git repository

2. **Configure environment variables:**
   - In your Vercel project settings
   - Add `LINEAR_WEBHOOK_SECRET` with your webhook secret

3. **Deploy:**
   - Vercel will automatically deploy on every push to main

### Method 3: Deploy Button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/internal-linear-connector)

## Release Tracking Feature

The webhook connector includes automatic release tracking that monitors Linear issue state changes and creates/updates release documents in Slite.

### How It Works

1. **State Change Detection**: When an issue with a "Story" label (parent ID: `037a6e45-7430-42bc-b6e9-c3a083514ead`) changes state, the system detects this change.

2. **State Comparison**: The system fetches both the previous and current state from Linear's API to confirm an actual state transition occurred.

3. **Release Document Management**:
   - Fetches all issues with the same story label
   - Checks if a release document already exists in Slite (collection ID: `Bg5eYBZU2CgDoY`)
   - Creates a new document or updates an existing one with the current ticket list

4. **Document Format**:
   ```markdown

   __________
   release_status: not_released
   release_at: 2025-07-28
   __________

   # [Label Name] Release overview

   ### Tickets

   | State | Ticket |
   |--------|-------|
   | ✅ Done | [[DEV-123] Fix authentication bug](https://linear.app/your-team/issue/DEV-123) |
   | ❌ In Progress | [[DEV-124] Add new user dashboard](https://linear.app/your-team/issue/DEV-124) |

   ### Summary by Assignee

   | Person | Todo % | In Progress % | DEV Review % | QA Testing % | Done % |
   |--------|--------|---------------|--------------|--------------|--------|
   | John Doe | 25.0% | 50.0% | 0.0% | 0.0% | 25.0% |
   | Jane Smith | 0.0% | 0.0% | 33.3% | 33.3% | 33.3% |
   | **Total** | 12.5% | 25.0% | 16.7% | 16.7% | 29.2% |

   Generated: 2025-01-20T10:30:00.000Z
   ```

### Configuration

To enable release tracking, ensure you have:
- `LINEAR_API_KEY`: For fetching issue states and ticket data
- `SLITE_API_KEY`: For creating/updating release documents
- Story labels with the correct parent ID in your Linear workspace

## Release Document Structure

When a story label issue changes state, the system automatically creates/updates a Slite document with:

```markdown
__________
release_status: not_released
release_at: 2025-07-28
__________

# [Label Name] Release overview

**Total Story Points: 42**

### Tickets

| State | Ticket | Story Points |
|--------|--------|--------------|
| ✅ Done | [[DEV-123] Feature A](https://linear.app/team/issue/DEV-123) | 5 |
| ❌ Todo | [[DEV-124] Feature B](https://linear.app/team/issue/DEV-124) | 8 |
| ❌ In Progress | [[DEV-125] Feature C](https://linear.app/team/issue/DEV-125) | 3 |

### Story Points by Assignee

| Person | Todo | In Progress | DEV Review | QA Testing | Done | Total |
|--------|------|-------------|------------|------------|------|-------|
| Alice | 8 | 3 | 0 | 0 | 5 | 16 |
| Bob | 0 | 0 | 2 | 3 | 8 | 13 |
| Unassigned | 5 | 0 | 0 | 0 | 8 | 13 |
| **Total** | **13** | **3** | **2** | **3** | **21** | **42** |

### Story Points Completion Percentages

| Person | Todo % | In Progress % | DEV Review % | QA Testing % | Done % |
|--------|--------|---------------|--------------|--------------|--------|
| Alice | 50.0% | 18.8% | 0.0% | 0.0% | 31.3% |
| Bob | 0.0% | 0.0% | 15.4% | 23.1% | 61.5% |
| Unassigned | 38.5% | 0.0% | 0.0% | 0.0% | 61.5% |
| **Total** | **31.0%** | **7.1%** | **4.8%** | **7.1%** | **50.0%** |

Generated: 2024-01-15T10:30:00.000Z
```

The system tracks:
- **Total Story Points**: Sum of all estimates across tickets
- **Story Points by Assignee**: Breakdown of points per person and state
- **Completion Percentages**: Progress based on story points (not ticket count)
- **Visual Indicators**: ✅ for "Done" state, ❌ for others
- **Clickable Links**: Direct links to Linear tickets with identifiers

## Project Structure

```
├── src/
│   ├── lib/
│   │   ├── api/
│   │   │   ├── linear-api.ts        # Linear GraphQL API client
│   │   │   └── slite-api.ts         # Slite REST API client
│   │   ├── types/
│   │   │   └── linear-webhook.ts    # TypeScript type definitions
│   │   └── webhook-processors/
│   │       ├── issue-processor.ts   # Issue webhook processing with release tracking
│   │       ├── comment-processor.ts # Comment webhook processing
│   │       ├── project-processor.ts # Project webhook processing
│   │       └── release-processor.ts # Release document management logic
│   └── app/
│       ├── api/
│       │   └── linear-webhook/
│       │       └── [type]/
│       │           └── route.ts     # Main webhook handler
│       ├── page.tsx                 # Home page with setup instructions
│       └── layout.tsx               # Root layout
├── env.example                      # Environment variables template
├── vercel.json                      # Vercel configuration
└── README.md                        # This file
```

## Customizing Webhook Processing

The webhook handler in `src/app/api/linear-webhook/[type]/route.ts` includes placeholder functions for processing different types of events:

- `processIssueWebhook()` - Handle issue events
- `processCommentWebhook()` - Handle comment events
- `processProjectWebhook()` - Handle project events

Add your custom logic in these functions to:
- Send notifications
- Update external systems
- Log events
- Trigger automated workflows

## Security

- **Webhook signature verification**: Uses HMAC-SHA256 to verify webhook authenticity
- **Environment variables**: Sensitive data stored securely
- **Error handling**: Comprehensive error logging without exposing internal details
- **CORS headers**: Configured for API access

## Troubleshooting

### Common Issues

1. **Webhook signature verification fails:**
   - Ensure `LINEAR_WEBHOOK_SECRET` matches the secret in Linear
   - Check that the secret is properly set in your environment

2. **Webhook not receiving events:**
   - Verify the webhook URL in Linear settings
   - Check that your deployment is accessible publicly
   - Look at Vercel function logs for errors

3. **TypeScript errors:**
   - Run `npm run build` to check for build issues
   - Ensure all types are properly imported

### Debugging

- Check Vercel function logs in your dashboard
- Use the test endpoints (GET requests) to verify deployment
- Monitor webhook delivery in Linear settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:
- **Linear webhooks**: Check [Linear's API documentation](https://developers.linear.app/docs/graphql/webhooks)
- **Next.js**: Visit [Next.js documentation](https://nextjs.org/docs)
- **Vercel deployment**: See [Vercel documentation](https://vercel.com/docs)
