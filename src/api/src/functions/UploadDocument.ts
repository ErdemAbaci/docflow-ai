import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { DocumentRecord } from "@docflow/shared";
import { uploadDocument } from "../services/blobStorage";
import { createDocument } from "../services/documentRepository";
import { enqueueDocument } from "../services/queue";

export async function UploadDocument(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const trackingId = randomUUID();
  const tenantId = "demo-tenant";
  context.log(JSON.stringify({ event: "document_upload_received", correlationId: trackingId }));

  const bodyBuffer = Buffer.from(await request.arrayBuffer());
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
