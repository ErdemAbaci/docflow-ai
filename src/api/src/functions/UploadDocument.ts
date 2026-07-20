import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient} from "@azure/cosmos";
import { ServiceBusClient } from "@azure/service-bus";

export async function UploadDocument(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const trackingId = randomUUID();
  context.log(JSON.stringify({ event: "document_upload_received", correlationId: trackingId }));

  const bodyBuffer = Buffer.from(await request.arrayBuffer());

  const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.DOCUMENTS_STORAGE_CONNECTION_STRING!);
  const containerClient = blobServiceClient.getContainerClient(process.env.DOCUMENTS_CONTAINER_NAME!);
  const blockBlobClient = containerClient.getBlockBlobClient(trackingId);

  await blockBlobClient.uploadData(bodyBuffer);

  const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!
  });
  const container = 
  cosmosClient.database(process.env.COSMOS_DATABASE!).container(process.env.COSMOS_CONTAINER!);

  await container.items.create({
    id: trackingId,
    tenantId: "demo-tenant",
    status: "queued",
    blobPath: trackingId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  context.log(JSON.stringify({ event: "document_blob_uploaded", correlationId: trackingId }));

  const serviceBusClient = new ServiceBusClient(process.env.SERVICEBUS_CONNECTION_STRING!);
  const sender = serviceBusClient.createSender(process.env.SERVICEBUS_QUEUE_NAME!);

  await sender.sendMessages({
    body: { trackingId, tenantId: "demo-tenant" }
  });
  await sender.close();
  await serviceBusClient.close();
  
  context.log(JSON.stringify({ event: "document_queued", correlationId: trackingId }));
  

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