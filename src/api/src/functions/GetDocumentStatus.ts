import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function GetDocumentStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const trackingId = request.params.id;
    context.log(JSON.stringify({ event: "document_status_requested", correlationId: trackingId }));
    return {
        status: 501,
        jsonBody: { message: "Not implemented yet", trackingId}
    }
};

app.http('GetDocumentStatus', {
    methods: ['GET'],
    route: 'documents/{id}/status',
    authLevel: 'anonymous',
    handler: GetDocumentStatus
});
