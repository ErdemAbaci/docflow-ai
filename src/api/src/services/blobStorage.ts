import { blobServiceClient } from "../clients";
import { config } from "../config";

// Container client de bir kez türetilir (clients.ts mantığının aynısı).
const containerClient = blobServiceClient.getContainerClient(config.storage.containerName);

export async function uploadDocument(blobName: string, data: Buffer): Promise<void> {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(data);
}
