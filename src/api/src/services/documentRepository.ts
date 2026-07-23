import { cosmosClient } from "../clients";
import { config } from "../config";
import { DocumentRecord } from "@docflow/shared";

const container = cosmosClient.database(config.cosmos.database).container(config.cosmos.container);

export async function createDocument(record: DocumentRecord): Promise<void> {
  await container.items.create(record);
}

export async function getDocument(trackingId: string, tenantId: string): Promise<DocumentRecord | undefined> {
  const { resource } = await container.item(trackingId, tenantId).read<DocumentRecord>();
  return resource;
}
