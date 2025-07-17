import { ReleaseChangeContext } from '../types/linear-webhook';
import { linearApi } from '../api/linear-api';
import { sliteApi } from '../api/slite-api';
import { createLogger } from '../logger';

// Story label parent ID is defined in issue-processor.ts

export async function processStatusReleaseChange(
  context: ReleaseChangeContext
) {
  const { labelName, labelId, previousState, currentState } = context;
  const log = createLogger('release-processor', { labelName, labelId });

  log.info(
    {
      labelName,
      labelId,
      previousState: previousState?.name,
      currentState: currentState?.name,
    },
    'Processing status release change'
  );

  try {
    // Fetch all tickets matching the label ID (same label as the changed ticket)
    const allTickets = await linearApi.getIssuesByLabel(labelId);

    log.info(
      { ticketCount: allTickets.length },
      `Found ${allTickets.length} tickets with label "${labelName}"`
    );

    // Format tickets for the release document
    const ticketList = allTickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      state: ticket.state.name,
      url: ticket.url,
      identifier: ticket.identifier,
      estimate: ticket.estimate, // Story points
      assignee: ticket.assignee,
    }));

    // Generate release date (7 days from now as default)
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 7);
    const releaseDateString = releaseDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if document already exists in Slite
    const existingDocument = await sliteApi.getDocumentByTitle(labelName);

    if (existingDocument) {
      log.info(
        {
          documentId: existingDocument.id,
          documentStatus: existingDocument.release_status,
          documentReleaseDate: existingDocument.release_at,
        },
        `Found existing document for "${labelName}", updating...`
      );

      // Parse existing metadata
      const existingStatus = existingDocument.release_status || 'not_released';
      const existingReleaseDate =
        existingDocument.release_at || releaseDateString;

      if (existingStatus !== 'not_released') {
        log.info(
          {
            existingStatus,
            documentId: existingDocument.id,
          },
          `Existing status is not "not_released", skipping update`
        );
        return {
          success: true,
          action: 'skipped',
          documentId: existingDocument.id,
          labelName,
        };
      }
      // If status is not_released, keep the existing release date
      const finalReleaseDate =
        existingStatus === 'not_released'
          ? existingReleaseDate
          : releaseDateString;

      // Update the document with new ticket list
      const updatedContent = sliteApi.formatReleaseDocument(
        labelName,
        finalReleaseDate,
        'not_released', // Always set to not_released for updates
        ticketList
      );

      const result = await sliteApi.updateDocument(
        existingDocument.id,
        updatedContent
      );

      if (result) {
        log.info(
          {
            documentId: result.id,
            ticketCount: ticketList.length,
            releaseDate: finalReleaseDate,
          },
          `Successfully updated release document for "${labelName}"`
        );
        return {
          success: true,
          action: 'updated',
          documentId: result.id,
          labelName,
          ticketCount: ticketList.length,
          releaseDate: finalReleaseDate,
        };
      } else {
        log.error(
          { labelName },
          `Failed to update release document for "${labelName}"`
        );
        return {
          success: false,
          error: 'Failed to update document in Slite',
        };
      }
    } else {
      log.info(
        { labelName },
        `No existing document found for "${labelName}", creating new one...`
      );

      // Create new document
      const newContent = sliteApi.formatReleaseDocument(
        labelName,
        releaseDateString,
        'not_released',
        ticketList
      );

      const result = await sliteApi.createDocument(labelName, newContent);

      if (result) {
        log.info(
          {
            documentId: result.id,
            ticketCount: ticketList.length,
            releaseDate: releaseDateString,
          },
          `Successfully created release document for "${labelName}"`
        );
        return {
          success: true,
          action: 'created',
          documentId: result.id,
          labelName,
          ticketCount: ticketList.length,
          releaseDate: releaseDateString,
        };
      } else {
        log.error(
          { labelName },
          `Failed to create release document for "${labelName}"`
        );
        return {
          success: false,
          error: 'Failed to create document in Slite',
        };
      }
    }
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        labelName,
        labelId,
      },
      'Error in processStatusReleaseChange'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
