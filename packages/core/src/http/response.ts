export type ApiError = {
  code: string;
  message: string;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  traceId?: string;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
  traceId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function getTraceId(request: Request): string | undefined {
  return request.headers.get('cf-ray') ?? request.headers.get('x-request-id') ?? undefined;
}

function jsonResponse<T>(body: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

export function ok<T>(data: T, traceId?: string): Response {
  return jsonResponse({ ok: true, data, traceId });
}

export function fail(
  code: string,
  message: string,
  status = 400,
  traceId?: string
): Response {
  return jsonResponse({ ok: false, error: { code, message }, traceId }, status);
}
