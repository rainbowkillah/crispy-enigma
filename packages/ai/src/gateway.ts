import type { Env } from '../../core/src/env';

export type ChatModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GatewayMetadata = Record<string, string | undefined>;

export type RunGatewayChatOptions = {
  stream?: boolean;
  fallbackModelId?: string;
  metadata?: GatewayMetadata;
};

export type GatewayTextResult = {
  kind: 'text';
  modelId: string;
  content: string;
  raw: unknown;
};

export type GatewayStreamResult = {
  kind: 'stream';
  modelId: string;
  stream: ReadableStream<string>;
};

export type GatewayChatResult = GatewayTextResult | GatewayStreamResult;

function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getReader' in value &&
    typeof (value as ReadableStream<unknown>).getReader === 'function'
  );
}

function buildGatewayOptions(
  tenantId: string,
  gatewayId: string,
  metadata?: GatewayMetadata
): { gateway: { id: string; metadata: Record<string, string> } } {
  const cleaned: Record<string, string> = {};
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' && value.length > 0) {
        cleaned[key] = value;
      }
    }
  }
  cleaned.tenantId = tenantId;

  return {
    gateway: {
      id: gatewayId,
      metadata: cleaned
    }
  };
}

function extractTextResponse(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result !== 'object' || result === null) {
    return String(result);
  }

  const record = result as Record<string, unknown>;
  const directCandidates = ['response', 'text', 'content', 'result'];
  for (const key of directCandidates) {
    if (typeof record[key] === 'string') {
      return record[key] as string;
    }
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const delta = first?.delta as Record<string, unknown> | undefined;
    const content = message?.content ?? delta?.content;
    if (typeof content === 'string') {
      return content;
    }
  }

  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function createSingleChunkStream(chunk: string): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      if (chunk.length > 0) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

type StreamChunk = Uint8Array | string;

function chunkToText(chunk: StreamChunk, decoder: TextDecoder): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  return decoder.decode(chunk, { stream: true });
}

function pickTokenFromJson(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directCandidates = ['response', 'delta', 'token', 'text', 'content'];
  for (const key of directCandidates) {
    if (typeof record[key] === 'string') {
      return record[key] as string;
    }
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const delta = first?.delta as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = delta?.content ?? message?.content;
    if (typeof content === 'string') {
      return content;
    }
  }

  return null;
}

function aiStreamToTokenStream(stream: ReadableStream<unknown>): ReadableStream<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';

  async function flushLine(controller: ReadableStreamDefaultController<string>, line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith('event:')) {
      return;
    }

    const data = trimmed.startsWith('data:')
      ? trimmed.slice('data:'.length).trim()
      : trimmed;

    if (!data) {
      return;
    }

    if (data === '[DONE]') {
      controller.close();
      return;
    }

    try {
      const parsed = JSON.parse(data) as unknown;
      const token = pickTokenFromJson(parsed);
      if (token) {
        controller.enqueue(token);
      }
      return;
    } catch {
      // Not JSON. Treat as raw token text.
      controller.enqueue(data);
    }
  }

  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const leftover = buffer.trim();
        buffer = '';
        if (leftover) {
          await flushLine(controller, leftover);
        }
        controller.close();
        return;
      }

      const text = chunkToText(value as StreamChunk, decoder);
      buffer += text;

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await flushLine(controller, line);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    }
  });
}

export async function runGatewayChat(
  tenantId: string,
  gatewayId: string,
  modelId: string,
  messages: ChatModelMessage[],
  env: Env,
  options: RunGatewayChatOptions = {}
): Promise<GatewayChatResult> {
  const runOptions = {
    ...buildGatewayOptions(tenantId, gatewayId, options.metadata),
    stream: options.stream === true
  } as unknown;

  const input = { messages } as unknown;

  let lastError: unknown;
  const modelCandidates = [
    modelId,
    ...(options.fallbackModelId && options.fallbackModelId !== modelId
      ? [options.fallbackModelId]
      : [])
  ];

  for (const candidate of modelCandidates) {
    try {
      const result = await (env.AI as unknown as { run: (...args: any[]) => Promise<unknown> }).run(
        candidate,
        input,
        runOptions as any
      );

      if (options.stream) {
        if (isReadableStream(result)) {
          return {
            kind: 'stream',
            modelId: candidate,
            stream: aiStreamToTokenStream(result)
          };
        }
        const content = extractTextResponse(result);
        return { kind: 'stream', modelId: candidate, stream: createSingleChunkStream(content) };
      }

      const content = extractTextResponse(result);
      return { kind: 'text', modelId: candidate, content, raw: result };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

