import "dotenv/config";
import { ServiceBusClient } from "@azure/service-bus";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "./src/config";
import { getDocument } from "./src/services/documentRepository";

async function main() {
  const sbClient = new ServiceBusClient(config.serviceBus.namespace, new DefaultAzureCredential());
  // subQueueType: "deadLetter" -> ana kuyruk değil, o kuyruğun DLQ alt kuyruğunu okur.
  // peekMessages kilitlemez/tüketmez, sadece "şu an ne var" diye bakar.
  const dlqReceiver = sbClient.createReceiver(config.serviceBus.queueName, { subQueueType: "deadLetter" });

  const messages = await dlqReceiver.peekMessages(50);
  console.log(`DLQ'da ${messages.length} mesaj var.\n`);

  for (const msg of messages) {
    const body = msg.body as { trackingId: string; tenantId: string };
    console.log(`--- trackingId: ${body.trackingId} ---`);
    console.log(`  deadLetterReason:      ${msg.deadLetterReason}`);
    console.log(`  deadLetterErrorDesc:   ${msg.deadLetterErrorDescription}`);
    console.log(`  deliveryCount:         ${msg.deliveryCount}`);

    const doc = await getDocument(body.trackingId, body.tenantId);
    console.log(`  Cosmos errorReason:    ${doc?.errorReason ?? "(kayıt yok)"}`);
    console.log("");
  }

  await dlqReceiver.close();
  await sbClient.close();
}

main().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
