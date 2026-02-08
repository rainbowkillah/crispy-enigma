export function generateTraceId(): string {
  return crypto.randomUUID();
}

export function extractTraceId(request: Request): string {
  const header = request.headers.get('x-trace-id');
  if (header) {
    return header;
  }
  return generateTraceId();
}
