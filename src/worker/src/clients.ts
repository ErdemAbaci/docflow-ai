// Azure SDK client'ları burada, modül seviyesinde, bir kez oluşturulur (API'deki clients.ts ile aynı desen).

import { ServiceBusClient } from "@azure/service-bus";
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "./config";

// Azure'da: worker'ın user-assigned identity'si (AZURE_CLIENT_ID env var'ı ile
// hangi identity olduğu belirtiliyor). Lokalde: `az login` oturumun.
const credential = new DefaultAzureCredential();

export const cosmosClient = new CosmosClient({
  endpoint: config.cosmos.endpoint,
  aadCredentials: credential,
});

const serviceBusClient = new ServiceBusClient(config.serviceBus.namespace, credential);

export const receiver = serviceBusClient.createReceiver(config.serviceBus.queueName);
