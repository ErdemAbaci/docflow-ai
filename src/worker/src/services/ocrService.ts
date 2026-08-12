import DocumentIntelligence, {
  AnalyzeOperationOutput,
  getLongRunningPoller,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config";

const client = DocumentIntelligence(config.documentIntelligence.endpoint, new DefaultAzureCredential());

export async function extractText(fileBuffer: Buffer): Promise<string> {
  const initialResponse = await client
    .path("/documentModels/{modelId}:analyze", "prebuilt-read")
    .post({
      contentType: "application/json",
      body: {
        base64Source: fileBuffer.toString("base64"),
      },
    });

  if (isUnexpected(initialResponse)) {
    throw new Error(`Document Intelligence hatası: ${JSON.stringify(initialResponse.body)}`);
  }

  const poller = getLongRunningPoller(client, initialResponse);
  const result = (await poller.pollUntilDone()).body as AnalyzeOperationOutput;

  const content = result.analyzeResult?.content;
  if (!content) {
    throw new Error("Document Intelligence boş metin döndürdü");
  }

  return content;
}
