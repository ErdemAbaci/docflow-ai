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
    key: required("COSMOS_KEY"),
    database: required("COSMOS_DATABASE"),
    container: required("COSMOS_CONTAINER"),
  },
  serviceBus: {
    connectionString: required("SERVICEBUS_CONNECTION_STRING"),
    queueName: required("SERVICEBUS_QUEUE_NAME"),
  },
};
