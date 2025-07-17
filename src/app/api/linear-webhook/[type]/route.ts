import { NextRequest, NextResponse } from 'next/server';
import {
  LinearWebhookPayload,
  LinearWebhookContext,
} from '@/lib/types/linear-webhook';
import { processIssueWebhook } from '@/lib/webhook-processors/issue-processor';
import { processCommentWebhook } from '@/lib/webhook-processors/comment-processor';
import { processProjectWebhook } from '@/lib/webhook-processors/project-processor';

// Webhook signature verification
async function verifyLinearWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const expectedSignature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const receivedSignature = signature.replace('sha256=', '');
    return expectedHex === receivedSignature;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

// Process different types of Linear webhook events
async function processLinearWebhook(context: LinearWebhookContext) {
  const { type, payload } = context;

  console.log(`Processing Linear webhook: ${type}`, {
    action: payload.action,
    issueId: payload.data.id,
    issueTitle: payload.data.title,
    organizationId: payload.organizationId,
  });

  switch (type) {
    case 'issue':
      return await processIssueWebhook(payload);
    case 'comment':
      return processCommentWebhook(payload);
    case 'project':
      return processProjectWebhook(payload);
    default:
      console.log(`Unknown webhook type: ${type}`);
      return { success: true, message: `Received ${type} webhook` };
  }
}

// Processor functions moved to separate files in /lib/webhook-processors/

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
): Promise<NextResponse> {
  try {
    const { type } = await params;
    const body = await request.text();

    // Get headers for signature verification and logging
    const signature = request.headers.get('linear-signature') || '';
    const webhookId = request.headers.get('linear-webhook-id') || '';
    const timestamp = request.headers.get('linear-timestamp') || '';

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET || '';

    if (webhookSecret) {
      const isValid = await verifyLinearWebhook(body, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    // Parse the webhook payload
    let payload: LinearWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Create webhook context
    const context: LinearWebhookContext = {
      type,
      payload,
      headers: {
        signature,
        webhookId,
        timestamp,
      },
    };

    // Process the webhook
    const result = await processLinearWebhook(context);

    // Log successful processing
    console.log(`Successfully processed ${type} webhook:`, result);

    return NextResponse.json({
      success: true,
      type,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error processing Linear webhook:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Handle GET requests for webhook endpoint testing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
): Promise<NextResponse> {
  const { type } = await params;

  return NextResponse.json({
    message: `Linear webhook endpoint for type: ${type}`,
    endpoint: `/api/linear-webhook/${type}`,
    method: 'POST',
    timestamp: new Date().toISOString(),
  });
}
