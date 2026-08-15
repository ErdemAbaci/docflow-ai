import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDocument } from "../services/documentRepository";

export async function GetDocument(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const trackingId = request.params.id;
  const tenantId = "demo-tenant";
  context.log(JSON.stringify({ event: "document_detail_requested", correlationId: trackingId }));

  const document = await getDocument(trackingId, tenantId);

  if (!document) {
    return { status: 404, jsonBody: { message: "Document not found", trackingId } };
  }

  return { status: 200, jsonBody: document };
}

app.http('GetDocument', {
  route: 'documents/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: GetDocument,
});
