import { getDocument, saveExtractedFields, markFailed } from "./services/documentRepository";
import { downloadDocument } from "./services/blobService";
import { extractText } from "./services/ocrService";
import { nvidiaExtractor } from "./services/extractors/nvidiaExtractor";
import { log } from "./log";
import { publishDocumentProcessed } from "./services/eventGridService";
// Bazı Azure SDK hataları (ör. Blob 404 RestError) .message'ı boş bırakıp
// gerçek bilgiyi .name / .statusCode'da taşıyor — sadece .message'a
// güvenirsek errorReason boş kalır.
function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) return error.message;
    const statusCode = (error as { statusCode?: number }).statusCode;
    return [error.name, statusCode ? `HTTP ${statusCode}` : undefined].filter(Boolean).join(": ") || String(error);
  }
  return String(error);
}

export async function handleDocumentMessage(trackingId: string, tenantId: string): Promise<void> {
  const existing = await getDocument(trackingId, tenantId);
  if (existing?.status === "processed") {
    log("document_processing_skipped_already_processed", { correlationId: trackingId });
    return;
  }
  if (!existing) {
    throw new Error(`Cosmos kaydı bulunamadı: trackingId=${trackingId}, tenantId=${tenantId}`);
  }

  log("document_processing_started", { correlationId: trackingId });

  try {
    const fileBuffer = await downloadDocument(existing.blobPath);
    const text = await extractText(fileBuffer);
    const fields = await nvidiaExtractor.extract(text);

    await saveExtractedFields(trackingId, tenantId, fields);

    log("document_processing_completed", { correlationId: trackingId });
    try {
      await publishDocumentProcessed(trackingId, tenantId, fields);
      log("document_processed_event_published", { correlationId: trackingId });
    } catch (error) {
      log("document_processed_event_publish_failed", {
        correlationId: trackingId,
        error: describeError(error),
      });
    }
  } catch (error) {
    const errorReason = describeError(error);
    await markFailed(trackingId, tenantId, errorReason);
    log("document_processing_failed", { correlationId: trackingId, error: errorReason });
    throw error;
  }
}
