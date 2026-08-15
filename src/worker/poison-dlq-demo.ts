import "dotenv/config";
import { ServiceBusClient } from "@azure/service-bus";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "crypto";
import { config } from "./src/config";
import { cosmosClient } from "./src/clients";

async function main() {
  const trackingId = randomUUID();
  const tenantId = "demo-tenant";

  console.log("1) Cosmos'a KASITLI BOZUK bir kayıt oluşturuluyor (blobPath hiç var olmayan bir dosyaya işaret ediyor)...");
  const container = cosmosClient.database(config.cosmos.database).container(config.cosmos.container);
  const now = new Date().toISOString();
  await container.items.create({
    id: trackingId,
    tenantId,
    status: "queued",
    blobPath: "bu-blob-hicbir-zaman-var-olmayacak",
    createdAt: now,
    updatedAt: now,
  });
  console.log(`   trackingId: ${trackingId}`);

  console.log("2) Aynı trackingId ile Service Bus kuyruğuna mesaj gönderiliyor...");
  const sbClient = new ServiceBusClient(config.serviceBus.namespace, new DefaultAzureCredential());
  const sender = sbClient.createSender(config.serviceBus.queueName);
  await sender.sendMessages({ body: { trackingId, tenantId } });
  await sender.close();
  await sbClient.close();

  console.log(`\nZehirli mesaj kuyrukta. trackingId: ${trackingId}`);
  console.log("Worker bu mesajı alacak, downloadDocument() blob bulamayacağı için hata fırlatacak,");
  console.log("markFailed ile Cosmos'a 'failed' yazılıp hata rethrow edilecek, Service Bus mesajı");
  console.log("abandon edip yeniden teslim edecek. Bu 5 kez tekrarlanınca Service Bus mesajı otomatik DLQ'ya taşıyacak.");
}

main().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
