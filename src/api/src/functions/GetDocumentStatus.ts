import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CosmosClient } from "@azure/cosmos";

export async function GetDocumentStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const trackingId = request.params.id;
    context.log(JSON.stringify({ event: "document_status_requested", correlationId: trackingId }));

    const cosmosClient = new CosmosClient({
        endpoint: process.env.COSMOS_ENDPOINT!,
        key: process.env.COSMOS_KEY!
    });
    const container = cosmosClient.database(process.env.COSMOS_DATABASE!).container(process.env.COSMOS_CONTAINER!);

        const { resource } = await container.item(trackingId!, "demo-tenant").read();

    if (!resource) {
        return { status: 404, jsonBody: { message: "Document not found", trackingId } };
    }

    return { status: 200, jsonBody: resource };
};

app.http('GetDocumentStatus', {
    route: 'documents/{id}/status',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: GetDocumentStatus
});