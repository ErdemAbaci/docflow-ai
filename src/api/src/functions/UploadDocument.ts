import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
export async function UploadDocument(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const trackingId = randomUUID();
  context.log(JSON.stringify({ event: "document_upload_received", correlationId: trackingId }));
  return {
    status: 202,
    jsonBody: { trackingId }
  }  
};

app.http('UploadDocument', {
    methods: ['POST'],
    route: 'documents',
    authLevel: 'anonymous',
    handler: UploadDocument
});
