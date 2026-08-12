// Ortam değişkenlerini tek yerde okur ve doğrular (API'deki config.ts ile aynı desen).

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Eksik ortam değişkeni: ${name}`);
  }
  return value;
}

export const config = {
  cosmos: {
    endpoint: required("COSMOS_ENDPOINT"),
    database: required("COSMOS_DATABASE"),
    container: required("COSMOS_CONTAINER"),
  },
  serviceBus: {
    // Connection string yerine sadece namespace hostname'i — kimlik doğrulama
    // artık DefaultAzureCredential ile (managed identity / az login) yapılıyor.
    namespace: required("SERVICEBUS_NAMESPACE"),
    queueName: required("SERVICEBUS_QUEUE_NAME"),
  },
  nvidia: {
    apiKey: required("NVIDIA_API_KEY"),
    apiUrl: required("NVIDIA_API_URL"),
  },
  storage: {
    accountUrl: required("DOCUMENTS_STORAGE_ACCOUNT_URL"),
    containerName: required("DOCUMENTS_CONTAINER_NAME"),
  },
  documentIntelligence: {
    endpoint: required("DOCUMENT_INTELLIGENCE_ENDPOINT"),
  },
};
