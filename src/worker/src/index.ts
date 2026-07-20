import "dotenv/config";
import { ServiceBusClient } from "@azure/service-bus";
import { CosmosClient } from "@azure/cosmos";

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() }));
}

async function main() {
  const serviceBusClient = new ServiceBusClient(process.env.SERVICEBUS_CONNECTION_STRING!);
  const receiver = serviceBusClient.createReceiver(process.env.SERVICEBUS_QUEUE_NAME!);

  const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!
  });
  const container = cosmosClient.database(process.env.COSMOS_DATABASE!).container(process.env.COSMOS_CONTAINER!);

  receiver.subscribe({
    processMessage: async (message) => {
      const { trackingId, tenantId } = message.body as { trackingId: string; tenantId: string };
      log("document_processing_started", { correlationId: trackingId });

      // TODO: gerçek OCR + AI burada olacak (Hafta 2), şimdilik stub
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await container.item(trackingId, tenantId).patch([
        { op: "replace", path: "/status", value: "processed" },
        { op: "replace", path: "/updatedAt", value: new Date().toISOString() }
      ]);

      log("document_processing_completed", { correlationId: trackingId });
    },
    processError: async (args) => {
      log("document_processing_error", { error: args.error.message });
    }
  });

  log("worker_started", { queue: process.env.SERVICEBUS_QUEUE_NAME });
}

main();