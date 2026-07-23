// Ortam değişkenlerini tek yerde okur ve doğrular.
// Eksik bir değer varsa uygulama daha başlarken net bir hatayla durur
// ("fail fast") — çalışma anında derinlerde belirsiz bir undefined hatası
// almaktansa, başlangıçta "şu değişken eksik" demek çok daha iyi.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Eksik ortam değişkeni: ${name}`);
  }
  return value;
}

export const config = {
  storage: {
    connectionString: required("DOCUMENTS_STORAGE_CONNECTION_STRING"),
    containerName: required("DOCUMENTS_CONTAINER_NAME"),
  },
  cosmos: {
    endpoint: required("COSMOS_ENDPOINT"),
    key: required("COSMOS_KEY"),
    database: required("COSMOS_DATABASE"),
    container: required("COSMOS_CONTAINER"),
  },
  serviceBus: {
    connectionString: required("SERVICEBUS_CONNECTION_STRING"),
    queueName: required("SERVICEBUS_QUEUE_NAME"),
  },
};
