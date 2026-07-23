// DocFlow ortak sözleşme (contract) — API ve worker bu tipleri paylaşır.
// Burada BİLEREK hiç @azure/* import'u yok: sadece derleme-zamanı tipler,
// runtime'da silinirler (Docker imajı bu pakete ihtiyaç duymaz).

export type DocumentStatus = "queued" | "processing" | "processed" | "failed";

// Cosmos'a yazdığımız belge kaydı.
export interface DocumentRecord {
  id: string; // = trackingId
  tenantId: string; // partition key
  status: DocumentStatus;
  blobPath: string;
  createdAt: string;
  updatedAt: string;

  // Hafta 2 (OCR + AI) ile dolacak alanlar — şimdilik opsiyonel.
  documentType?: string;
  issueDate?: string;
  amount?: number;
  currency?: string;
  vendor?: string | null;
  summary?: string | null;
  errorReason?: string | null;
}

// Upload endpoint'inin Service Bus kuyruğuna bıraktığı mesaj.
export interface DocumentQueueMessage {
  trackingId: string;
  tenantId: string;
}
