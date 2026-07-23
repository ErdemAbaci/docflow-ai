import "dotenv/config";
import { receiver } from "./clients";
import { updateStatus } from "./services/documentRepository";
import { config } from "./config";

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() }));
}

receiver.subscribe({
  processMessage: async (message) => {
    const { trackingId, tenantId } = message.body as { trackingId: string; tenantId: string };
    log("document_processing_started", { correlationId: trackingId });

    // TODO: gerçek OCR + AI burada olacak (Hafta 2), şimdilik stub
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await updateStatus(trackingId, tenantId, "processed");

    log("document_processing_completed", { correlationId: trackingId });
  },
  processError: async (args) => {
    log("document_processing_error", { error: args.error.message });
  },
});

log("worker_started", { queue: config.serviceBus.queueName });
