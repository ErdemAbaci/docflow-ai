import "dotenv/config";
import { receiver } from "./clients";
import { handleDocumentMessage } from "./messageHandler";
import { log } from "./log";
import { config } from "./config";

receiver.subscribe({
  processMessage: async (message) => {
    const { trackingId, tenantId } = message.body as { trackingId: string; tenantId: string };
    await handleDocumentMessage(trackingId, tenantId);
  },
  processError: async (args) => {
    log("document_processing_error", { error: args.error.message });
  },
});

log("worker_started", { queue: config.serviceBus.queueName });
