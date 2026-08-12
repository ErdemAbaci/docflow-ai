import { DocumentStatus, DocumentRecord, ExtractedFields } from "@docflow/shared"
import { cosmosClient } from "../clients";
import { config } from "../config";

const container = cosmosClient.database(config.cosmos.database).container(config.cosmos.container);

export async function updateStatus(trackingId: string, tenantId: string, status: DocumentStatus): Promise<void>{
    await container.item(trackingId, tenantId).patch([
  { op: "replace", path: "/status", value: status },
  { op: "replace", path: "/updatedAt", value: new Date().toISOString() }
]);
}

// LLM'in çıkardığı alanları kaydeder ve status'u processed yapar.
// "add" kullanıyoruz çünkü bu alanlar DocumentRecord'da opsiyonel — ilk işlemede
// Cosmos kaydında henüz yoklar, "replace" var olmayan path'te hata verirdi.
export async function saveExtractedFields(
  trackingId: string,
  tenantId: string,
  fields: ExtractedFields
): Promise<void> {
  await container.item(trackingId, tenantId).patch([
    { op: "replace", path: "/status", value: "processed" satisfies DocumentStatus },
    { op: "replace", path: "/updatedAt", value: new Date().toISOString() },
    { op: "add", path: "/documentType", value: fields.documentType },
    { op: "add", path: "/issueDate", value: fields.issueDate },
    { op: "add", path: "/amount", value: fields.amount },
    { op: "add", path: "/currency", value: fields.currency },
    { op: "add", path: "/vendor", value: fields.vendor },
    { op: "add", path: "/summary", value: fields.summary },
  ]);
}

// Bir işleme denemesi başarısız olduğunda çağrılır. "add" kullanıyoruz çünkü
// errorReason ilk hatada Cosmos kaydında henüz yok; sonraki denemelerde
// "add" var olan path'i de günceller (RFC 6902), yani en son hatayı gösterir.
export async function markFailed(
  trackingId: string,
  tenantId: string,
  errorReason: string
): Promise<void> {
  await container.item(trackingId, tenantId).patch([
    { op: "replace", path: "/status", value: "failed" satisfies DocumentStatus },
    { op: "replace", path: "/updatedAt", value: new Date().toISOString() },
    { op: "add", path: "/errorReason", value: errorReason },
  ]);
}

export async function getDocument(trackingId: string, tenantId: string): Promise<DocumentRecord | undefined> {
    const { resource } = await container.item(trackingId, tenantId).read<DocumentRecord>();
    return resource;
}