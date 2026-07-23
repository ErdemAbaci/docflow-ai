// Azure SDK client'ları burada, modül seviyesinde, bir kez oluşturulur (API'deki clients.ts ile aynı desen).

import { ServiceBusClient } from "@azure/service-bus";
import { CosmosClient } from "@azure/cosmos";
import { config } from "./config";

export const cosmosClient = new CosmosClient({
  endpoint: config.cosmos.endpoint,
  key: config.cosmos.key,
});

const serviceBusClient = new ServiceBusClient(config.serviceBus.connectionString);

export const receiver = serviceBusClient.createReceiver(config.serviceBus.queueName);
