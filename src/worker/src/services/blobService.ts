import { BlobServiceClient } from "@azure/storage-blob";
import { config } from "../config";

const blobServiceClient = BlobServiceClient.fromConnectionString(config.storage.connectionString);
const containerClient = blobServiceClient.getContainerClient(config.storage.containerName);

export async function downloadDocument(blobPath: string): Promise<Buffer> {
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  return blockBlobClient.downloadToBuffer();
}
