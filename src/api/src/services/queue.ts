import { serviceBusClient } from "../clients";
import { config } from "../config";
import { DocumentQueueMessage } from "@docflow/shared";

// Sender da bir kez oluşturulur ve süreç boyunca yaşar.
// Eskiden her istekte createSender + close yapıyorduk; artık gerekmiyor.
const sender = serviceBusClient.createSender(config.serviceBus.queueName);

export async function enqueueDocument(message: DocumentQueueMessage): Promise<void> {
  await sender.sendMessages({ body: message });
}
