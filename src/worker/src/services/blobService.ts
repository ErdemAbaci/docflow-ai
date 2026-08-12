import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config";

const blobServiceClient = new BlobServiceClient(config.storage.accountUrl, new DefaultAzureCredential());
const containerClient = blobServiceClient.getContainerClient(config.storage.containerName);

export async function downloadDocument(blobPath: string): Promise<Buffer> {
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  return blockBlobClient.downloadToBuffer();
}
