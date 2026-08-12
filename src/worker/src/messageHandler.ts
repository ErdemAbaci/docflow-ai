import { getDocument, saveExtractedFields, markFailed } from "./services/documentRepository";
import { downloadDocument } from "./services/blobService";
import { extractText } from "./services/ocrService";
import { nvidiaExtractor } from "./services/extractors/nvidiaExtractor";
import { log } from "./log";

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
  } catch (error) {
    const errorReason = error instanceof Error ? error.message : String(error);
    await markFailed(trackingId, tenantId, errorReason);
    log("document_processing_failed", { correlationId: trackingId, error: errorReason });
    throw error;
  }
}
