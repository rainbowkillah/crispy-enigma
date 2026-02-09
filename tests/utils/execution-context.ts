export function createExecutionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      void promise;
    },
    passThroughOnException() {
      // No-op for tests.
    },
    props: {
      cf: {} as Record<string, unknown>,
      url: new URL('https://test.local'),
      method: 'GET',
      headers: new Headers(),
      errors: [],
      logs: [],
      timings: {}
    }
  };
}
