import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { queryDocuments } from "../services/documentRepository";

export async function ListDocuments(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const tenantId = "demo-tenant";

  const dateFrom = request.query.get("dateFrom") ?? undefined;
  const dateTo = request.query.get("dateTo") ?? undefined;
  const documentType = request.query.get("documentType") ?? undefined;

  const amountMinRaw = request.query.get("amountMin");
  const amountMaxRaw = request.query.get("amountMax");
  const amountMin = amountMinRaw !== null ? Number(amountMinRaw) : undefined;
  const amountMax = amountMaxRaw !== null ? Number(amountMaxRaw) : undefined;

  if ((amountMin !== undefined && Number.isNaN(amountMin)) || (amountMax !== undefined && Number.isNaN(amountMax))) {
    return { status: 400, jsonBody: { message: "amountMin/amountMax sayısal olmalı" } };
  }

  context.log(JSON.stringify({ event: "document_list_requested", dateFrom, dateTo, amountMin, amountMax, documentType }));

  const documents = await queryDocuments(tenantId, { dateFrom, dateTo, amountMin, amountMax, documentType });

  return { status: 200, jsonBody: { documents } };
}

app.http('ListDocuments', {
  route: 'documents',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: ListDocuments,
});
