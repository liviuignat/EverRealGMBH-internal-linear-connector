import { ReleaseChangeContext } from '../types/linear-webhook';
import { linearApi } from '../api/linear-api';
import { sliteApi } from '../api/slite-api';

// Story label parent ID is defined in issue-processor.ts

export async function processStatusReleaseChange(
  context: ReleaseChangeContext
) {
  const { labelName, labelId, previousState, currentState } = context;

  console.log('Processing status release change:', {
    labelName,
    labelId,
    previousState: previousState?.name,
    currentState: currentState?.name,
  });

  try {
    // Fetch all tickets matching the label ID (same label as the changed ticket)
    const allTickets = await linearApi.getIssuesByLabel(labelId);

    console.log(`Found ${allTickets.length} tickets with label "${labelName}"`);

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
      console.log(`Found existing document for "${labelName}", updating...`, {
        ...existingDocument,
      });

      // Parse existing metadata
      const existingStatus = existingDocument.status || 'not_released';
      const existingReleaseDate =
        existingDocument.release_at || releaseDateString;

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
        console.log(`Successfully updated release document for "${labelName}"`);
        return {
          success: true,
          action: 'updated',
          documentId: result.id,
          labelName,
          ticketCount: ticketList.length,
          releaseDate: finalReleaseDate,
        };
      } else {
        console.error(`Failed to update release document for "${labelName}"`);
        return {
          success: false,
          error: 'Failed to update document in Slite',
        };
      }
    } else {
      console.log(
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
        console.log(`Successfully created release document for "${labelName}"`);
        return {
          success: true,
          action: 'created',
          documentId: result.id,
          labelName,
          ticketCount: ticketList.length,
          releaseDate: releaseDateString,
        };
      } else {
        console.error(`Failed to create release document for "${labelName}"`);
        return {
          success: false,
          error: 'Failed to create document in Slite',
        };
      }
    }
  } catch (error) {
    console.error('Error in processStatusReleaseChange:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
