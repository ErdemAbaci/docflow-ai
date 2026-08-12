import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "crypto";
import { config } from "./src/config";
import { downloadDocument } from "./src/services/blobService";
import { extractText } from "./src/services/ocrService";
import { nvidiaExtractor } from "./src/services/extractors/nvidiaExtractor";
import { saveExtractedFields, getDocument } from "./src/services/documentRepository";
import { cosmosClient } from "./src/clients";

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
  const trackingId = randomUUID();
  const tenantId = "demo-tenant";

  console.log("1) Test belgesi ve Cosmos kaydı oluşturuluyor...");
  const pdfBuffer = makeTestPdf([
    "ABC TICARET LTD STI",
    "Fatura No FTR-2026-00458",
    "Tarih 15.03.2026",
    "Ara Toplam 1400.00 TL",
    "KDV 280.00 TL",
    "Genel Toplam 1680.00 TL",
  ]);

  const blobServiceClient = new BlobServiceClient(config.storage.accountUrl, new DefaultAzureCredential());
  const containerClient = blobServiceClient.getContainerClient(config.storage.containerName);
  await containerClient.getBlockBlobClient(trackingId).uploadData(pdfBuffer);

  const container = cosmosClient.database(config.cosmos.database).container(config.cosmos.container);
  const now = new Date().toISOString();
  await container.items.create({
    id: trackingId,
    tenantId,
    status: "queued",
    blobPath: trackingId,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`   trackingId: ${trackingId}\n`);

  console.log("2) index.ts'teki akışın aynısı: indir -> OCR -> LLM -> Cosmos'a yaz");
  const fileBuffer = await downloadDocument(trackingId);
  const text = await extractText(fileBuffer);
  console.log("   OCR metni:", text);

  const fields = await nvidiaExtractor.extract(text);
  console.log("   LLM alanları:", fields);

  await saveExtractedFields(trackingId, tenantId, fields);
  console.log("   Cosmos'a yazıldı.\n");

  console.log("3) Cosmos'tan geri okunuyor (doğrulama)...");
  const saved = await getDocument(trackingId, tenantId);
  console.log(JSON.stringify(saved, null, 2));

  console.log("\n4) Temizlik: blob ve Cosmos kaydı siliniyor...");
  await containerClient.getBlockBlobClient(trackingId).delete();
  await container.item(trackingId, tenantId).delete();
  console.log("   Temizlendi.");
}

main().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
