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

// LLM'in OCR metninden çıkardığı alanlar. Bulunamayan alan null olur
// (undefined değil) — "arandı ama yok" ile "hiç aranmadı" farkını netleştirir.
export interface ExtractedFields {
  documentType: string;
  issueDate: string | null;
  amount: number | null;
  currency: string | null;
  vendor: string | null;
  summary: string | null;
}

// Worker'ın LLM sağlayıcısını bilmeden kullandığı sözleşme.
// Gerçek implementasyon (ör. NVIDIA NIM) worker/src/services/extractors altında olacak.
export interface Extractor {
  extract(text: string): Promise<ExtractedFields>;
}
