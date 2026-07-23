import { DocumentStatus } from "@docflow/shared"
import { cosmosClient } from "../clients";
import { config } from "../config";

const container = cosmosClient.database(config.cosmos.database).container(config.cosmos.container);

export async function updateStatus(trackingId: string, tenantId: string, status: DocumentStatus): Promise<void>{
    await container.item(trackingId, tenantId).patch([
  { op: "replace", path: "/status", value: status },
  { op: "replace", path: "/updatedAt", value: new Date().toISOString() }
]);
}
