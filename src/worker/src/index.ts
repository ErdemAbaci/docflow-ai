import "dotenv/config";
import { receiver } from "./clients";
import { getDocument, saveExtractedFields } from "./services/documentRepository";
import { downloadDocument } from "./services/blobService";
import { extractText } from "./services/ocrService";
import { nvidiaExtractor } from "./services/extractors/nvidiaExtractor";
import { config } from "./config";

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() }));
}

receiver.subscribe({
  processMessage: async (message) => {
    const { trackingId, tenantId } = message.body as { trackingId: string; tenantId: string };

    const existing = await getDocument(trackingId, tenantId);
    if (existing?.status === "processed") {
      log("document_processing_skipped_already_processed", { correlationId: trackingId });
      return;
    }
    if (!existing) {
      throw new Error(`Cosmos kaydı bulunamadı: trackingId=${trackingId}, tenantId=${tenantId}`);
    }

    log("document_processing_started", { correlationId: trackingId });

    const fileBuffer = await downloadDocument(existing.blobPath);
    const text = await extractText(fileBuffer);
    const fields = await nvidiaExtractor.extract(text);

    await saveExtractedFields(trackingId, tenantId, fields);

    log("document_processing_completed", { correlationId: trackingId });
  },
  processError: async (args) => {
    log("document_processing_error", { error: args.error.message });
  },
});

log("worker_started", { queue: config.serviceBus.queueName });
