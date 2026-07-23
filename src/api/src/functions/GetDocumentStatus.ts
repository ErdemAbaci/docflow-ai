import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDocument } from "../services/documentRepository";

export async function GetDocumentStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const trackingId = request.params.id;
  context.log(JSON.stringify({ event: "document_status_requested", correlationId: trackingId }));

  const document = await getDocument(trackingId, "demo-tenant");

  if (!document) {
    return { status: 404, jsonBody: { message: "Document not found", trackingId } };
  }

  return { status: 200, jsonBody: document };
}

app.http('GetDocumentStatus', {
  route: 'documents/{id}/status',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: GetDocumentStatus,
});
