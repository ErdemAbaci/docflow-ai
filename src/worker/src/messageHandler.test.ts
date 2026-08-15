import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./services/documentRepository", () => ({
  getDocument: vi.fn(),
  saveExtractedFields: vi.fn(),
  markFailed: vi.fn(),
}));
vi.mock("./services/blobService", () => ({
  downloadDocument: vi.fn(),
}));
vi.mock("./services/ocrService", () => ({
  extractText: vi.fn(),
}));
vi.mock("./services/extractors/nvidiaExtractor", () => ({
  nvidiaExtractor: { extract: vi.fn() },
}));

import { getDocument, saveExtractedFields, markFailed } from "./services/documentRepository";
import { downloadDocument } from "./services/blobService";
import { extractText } from "./services/ocrService";
import { nvidiaExtractor } from "./services/extractors/nvidiaExtractor";
import { handleDocumentMessage } from "./messageHandler";

const trackingId = "track-1";
const tenantId = "tenant-1";

const baseRecord = {
  id: trackingId,
  tenantId,
  status: "queued" as const,
  blobPath: "documents/track-1.pdf",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

describe("handleDocumentMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kayıt zaten processed ise hiçbir işlem yapmadan çıkar", async () => {
    vi.mocked(getDocument).mockResolvedValue({ ...baseRecord, status: "processed" });

    await handleDocumentMessage(trackingId, tenantId);

    expect(downloadDocument).not.toHaveBeenCalled();
    expect(extractText).not.toHaveBeenCalled();
    expect(nvidiaExtractor.extract).not.toHaveBeenCalled();
    expect(saveExtractedFields).not.toHaveBeenCalled();
  });

  it("Cosmos'ta kayıt bulunamazsa hata fırlatır", async () => {
    vi.mocked(getDocument).mockResolvedValue(undefined);

    await expect(handleDocumentMessage(trackingId, tenantId)).rejects.toThrow(
      /Cosmos kaydı bulunamadı/
    );

    expect(downloadDocument).not.toHaveBeenCalled();
  });

  it("başarılı akışta saveExtractedFields çağrılır, markFailed çağrılmaz", async () => {
    vi.mocked(getDocument).mockResolvedValue(baseRecord);
    vi.mocked(downloadDocument).mockResolvedValue(Buffer.from("pdf-bytes"));
    vi.mocked(extractText).mockResolvedValue("ocr metni");
    const fields = {
      documentType: "fatura",
      issueDate: "2026-08-11",
      amount: 1680,
      currency: "TRY",
      vendor: "Acme",
      summary: "Örnek fatura",
    };
    vi.mocked(nvidiaExtractor.extract).mockResolvedValue(fields);

    await handleDocumentMessage(trackingId, tenantId);

    expect(downloadDocument).toHaveBeenCalledWith(baseRecord.blobPath);
    expect(extractText).toHaveBeenCalledWith(Buffer.from("pdf-bytes"));
    expect(nvidiaExtractor.extract).toHaveBeenCalledWith("ocr metni");
    expect(saveExtractedFields).toHaveBeenCalledWith(trackingId, tenantId, fields);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("zincirde bir adım patlarsa markFailed doğru errorReason ile çağrılır ve hata yeniden fırlatılır", async () => {
    vi.mocked(getDocument).mockResolvedValue(baseRecord);
    vi.mocked(downloadDocument).mockResolvedValue(Buffer.from("pdf-bytes"));
    vi.mocked(extractText).mockRejectedValue(new Error("Document Intelligence hatası: 500"));

    await expect(handleDocumentMessage(trackingId, tenantId)).rejects.toThrow(
      "Document Intelligence hatası: 500"
    );

    expect(markFailed).toHaveBeenCalledWith(
      trackingId,
      tenantId,
      "Document Intelligence hatası: 500"
    );
    expect(saveExtractedFields).not.toHaveBeenCalled();
  });

  it("hatanın .message'ı boşsa (ör. Blob 404 RestError) name/statusCode'a düşer", async () => {
    vi.mocked(getDocument).mockResolvedValue(baseRecord);
    const restError = new Error("");
    restError.name = "RestError";
    (restError as unknown as { statusCode: number }).statusCode = 404;
    vi.mocked(downloadDocument).mockRejectedValue(restError);

    await expect(handleDocumentMessage(trackingId, tenantId)).rejects.toThrow();

    expect(markFailed).toHaveBeenCalledWith(trackingId, tenantId, "RestError: HTTP 404");
  });
});
