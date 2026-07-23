// Azure SDK client'ları BURADA, modül seviyesinde, BİR KEZ oluşturulur.
// Bir modül ilk kez import edildiğinde çalışır ve sonucu önbelleğe alınır;
// sonraki her import aynı örneği alır (singleton). Böylece her HTTP isteğinde
// yeniden client kurmayız — client'lar stateless ve pahalı-kurulan nesnelerdir.
// (AWS'deki "client'ı Lambda handler'ının DIŞINDA tanımla" kuralının aynısı.)

import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";
import { ServiceBusClient } from "@azure/service-bus";
import { config } from "./config";

export const blobServiceClient = BlobServiceClient.fromConnectionString(
  config.storage.connectionString
);

export const cosmosClient = new CosmosClient({
  endpoint: config.cosmos.endpoint,
  key: config.cosmos.key,
});

export const serviceBusClient = new ServiceBusClient(
  config.serviceBus.connectionString
);
