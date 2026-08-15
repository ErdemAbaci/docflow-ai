import { EventGridPublisherClient } from "@azure/eventgrid";
import { DefaultAzureCredential } from "@azure/identity";
import { ExtractedFields } from "@docflow/shared";
import { config } from "../config";

// "EventGrid" = topic'in şema tipi. Terraform'da azurerm_eventgrid_topic
// varsayılan olarak EventGridSchema kullanıyor, ikisi eşleşmeli.
const client = new EventGridPublisherClient(
  config.eventGrid.topicEndpoint,
  "EventGrid",
  new DefaultAzureCredential()
);

export async function publishDocumentProcessed(
  trackingId: string,
  tenantId: string,
  fields: ExtractedFields
): Promise<void> {
  await client.send([
    {
      eventType: "DocFlow.DocumentProcessed",
      // subject'i "documents/<id>" formatında tutuyoruz çünkü Event Grid
      // abonelikleri subject prefix'ine göre filtreleyebiliyor — ileride
      // "sadece şu tenant'ın belgeleri" gibi bir abone eklemek kolay olsun.
      subject: `documents/${trackingId}`,
      dataVersion: "1.0",
      data: { trackingId, tenantId, ...fields },
    },
  ]);
}