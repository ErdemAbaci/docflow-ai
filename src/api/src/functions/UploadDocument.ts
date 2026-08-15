import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { DocumentRecord } from "@docflow/shared";
import { uploadDocument } from "../services/blobStorage";
import { createDocument } from "../services/documentRepository";
import { enqueueDocument } from "../services/queue";

// Document Intelligence F0 (free tier) dosya başına 4 MB ile sınırlı;
// üstü zaten OCR aşamasında hata verip Service Bus'ı 5 kez boşuna
// yeniden denetir, o yüzden burada erken reddediyoruz.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function UploadDocument(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const trackingId = randomUUID();
  const tenantId = "demo-tenant";
  context.log(JSON.stringify({ event: "document_upload_received", correlationId: trackingId }));

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return {
      status: 413,
      jsonBody: { message: `Dosya çok büyük. Maksimum ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.` },
    };
  }

  const bodyBuffer = Buffer.from(await request.arrayBuffer());
  if (bodyBuffer.length > MAX_UPLOAD_BYTES) {
    return {
      status: 413,
      jsonBody: { message: `Dosya çok büyük. Maksimum ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.` },
    };
  }

  await uploadDocument(trackingId, bodyBuffer);
  context.log(JSON.stringify({ event: "document_blob_uploaded", correlationId: trackingId }));

  const now = new Date().toISOString();
  const record: DocumentRecord = {
    id: trackingId,
    tenantId,
    status: "queued",
    blobPath: trackingId,
    createdAt: now,
    updatedAt: now,
  };
  await createDocument(record);

  await enqueueDocument({ trackingId, tenantId });
  context.log(JSON.stringify({ event: "document_queued", correlationId: trackingId }));

  return {
    status: 202,
    jsonBody: { trackingId },
  };
}

app.http('UploadDocument', {
  methods: ['POST'],
  route: 'documents',
  authLevel: 'anonymous',
  handler: UploadDocument,
});
