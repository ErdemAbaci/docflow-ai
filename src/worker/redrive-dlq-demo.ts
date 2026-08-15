import "dotenv/config";
import { ServiceBusClient, ServiceBusReceivedMessage } from "@azure/service-bus";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "./src/config";
import { getDocument } from "./src/services/documentRepository";

// e2e-test.ts'teki ile birebir aynı, Document Intelligence'ın kabul ettiği
// doğrulanmış minimal PDF üretici.
function makeTestPdf(lines: string[]): Buffer {
  const content = lines
    .map((line, i) => `BT /F1 14 Tf 40 ${740 - i * 20} Td (${line}) Tj ET`)
    .join("\n");
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;
  return Buffer.from(pdf);
}

async function main() {
  const trackingId = process.argv[2];
  if (!trackingId) {
    console.error("Kullanım: npx ts-node redrive-dlq-demo.ts <trackingId>");
    process.exit(1);
  }

  const credential = new DefaultAzureCredential();
  const sbClient = new ServiceBusClient(config.serviceBus.namespace, credential);
  const dlqReceiver = sbClient.createReceiver(config.serviceBus.queueName, { subQueueType: "deadLetter" });

  console.log(`1) DLQ'dan trackingId=${trackingId} olan mesaj aranıyor...`);
  const messages = await dlqReceiver.receiveMessages(10, { maxWaitTimeInMs: 5000 });
  const target: ServiceBusReceivedMessage | undefined = messages.find(
    (m) => (m.body as { trackingId: string }).trackingId === trackingId
  );

  if (!target) {
    console.log("   Bulunamadı. Kilitlenen diğer mesajlar serbest bırakılıyor (DLQ'da kalırlar)...");
    for (const m of messages) await dlqReceiver.abandonMessage(m);
    await dlqReceiver.close();
    await sbClient.close();
    return;
  }

  // Eşleşmeyen mesajları kilitten kurtar ki DLQ'da olduğu gibi kalsınlar.
  for (const m of messages) {
    if (m !== target) await dlqReceiver.abandonMessage(m);
  }
  console.log("   Bulundu.");

  const body = target.body as { trackingId: string; tenantId: string };
  const doc = await getDocument(body.trackingId, body.tenantId);
  if (!doc) {
    throw new Error(`Cosmos kaydı bulunamadı: trackingId=${body.trackingId}`);
  }

  console.log(`2) Kök neden düzeltiliyor: Cosmos'taki blobPath'e (${doc.blobPath}) gerçek bir PDF yükleniyor...`);
  const blobServiceClient = new BlobServiceClient(config.storage.accountUrl, credential);
  const containerClient = blobServiceClient.getContainerClient(config.storage.containerName);
  const pdf = makeTestPdf(["KURTARILAN FATURA", "Genel Toplam 250.00 TL"]);
  await containerClient.getBlockBlobClient(doc.blobPath).uploadData(pdf);
  console.log(`   Blob yüklendi: ${doc.blobPath}`);

  console.log("3) Mesaj ana kuyruğa geri gönderiliyor...");
  const sender = sbClient.createSender(config.serviceBus.queueName);
  await sender.sendMessages({ body: target.body });
  await sender.close();

  console.log("4) DLQ'daki orijinal mesaj tamamlanıyor (DLQ'dan siliniyor)...");
  await dlqReceiver.completeMessage(target);

  await dlqReceiver.close();
  await sbClient.close();

  console.log("\nTamamlandı. Worker çalışıyorsa mesajı tekrar alıp bu sefer başarıyla işlemeli.");
}

main().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
