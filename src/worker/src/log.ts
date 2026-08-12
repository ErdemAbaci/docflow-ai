export function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() }));
}
