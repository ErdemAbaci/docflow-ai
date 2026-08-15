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

export interface DocumentQueryFilters {
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  documentType?: string;
}

export async function queryDocuments(
  tenantId: string,
  filters: DocumentQueryFilters
): Promise<DocumentRecord[]> {
  const conditions: string[] = [];
  const parameters: { name: string; value: string | number }[] = [];

  if (filters.dateFrom) {
    conditions.push("c.issueDate >= @dateFrom");
    parameters.push({ name: "@dateFrom", value: filters.dateFrom });
  }
  if (filters.dateTo) {
    conditions.push("c.issueDate <= @dateTo");
    parameters.push({ name: "@dateTo", value: filters.dateTo });
  }
  if (filters.amountMin !== undefined) {
    conditions.push("c.amount >= @amountMin");
    parameters.push({ name: "@amountMin", value: filters.amountMin });
  }
  if (filters.amountMax !== undefined) {
    conditions.push("c.amount <= @amountMax");
    parameters.push({ name: "@amountMax", value: filters.amountMax });
  }
  if (filters.documentType) {
    conditions.push("c.documentType = @documentType");
    parameters.push({ name: "@documentType", value: filters.documentType });
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // partitionKey seçeneği sorguyu tek partition'a sabitler (cross-partition
  // fan-out yok) — DynamoDB'de Query (PK ile) yapmanın Cosmos karşılığı.
  const { resources } = await container.items
    .query<DocumentRecord>(
      { query: `SELECT * FROM c ${whereClause}`, parameters },
      { partitionKey: tenantId }
    )
    .fetchAll();

  return resources;
}
