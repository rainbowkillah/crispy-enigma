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
  onUsage?: (metrics: GatewayUsageMetrics) => void | Promise<void>;
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

export type GatewayUsageMetrics = {
  tenantId: string;
  gatewayId: string;
  modelId: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
  stream: boolean;
  status: 'success' | 'error';
  traceId?: string;
  route?: string;
};

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

export function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTokensFromLength(length: number): number {
  if (!length || length <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(length / 4));
}

export function estimateTokensFromMessages(messages: ChatModelMessage[]): number {
  return messages.reduce((total, message) => {
    return total + estimateTokensFromText(message.content);
  }, 0);
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

function extractUsageTokens(result: unknown): {
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
} {
  if (typeof result !== 'object' || result === null) {
    return {};
  }
  const record = result as Record<string, unknown>;
  const usage = record.usage as Record<string, unknown> | undefined;
  if (usage) {
    const input =
      (usage.input_tokens as number | undefined) ??
      (usage.prompt_tokens as number | undefined);
    const output =
      (usage.output_tokens as number | undefined) ??
      (usage.completion_tokens as number | undefined);
    const total = usage.total_tokens as number | undefined;
    return {
      tokensIn: typeof input === 'number' ? input : undefined,
      tokensOut: typeof output === 'number' ? output : undefined,
      totalTokens: typeof total === 'number' ? total : undefined
    };
  }
  return {};
}

function buildUsageMetrics(
  tenantId: string,
  gatewayId: string,
  modelId: string,
  latencyMs: number,
  stream: boolean,
  status: 'success' | 'error',
  options: RunGatewayChatOptions,
  tokensIn?: number,
  tokensOut?: number,
  totalTokens?: number
): GatewayUsageMetrics {
  return {
    tenantId,
    gatewayId,
    modelId,
    latencyMs,
    tokensIn,
    tokensOut,
    totalTokens,
    stream,
    status,
    traceId: options.metadata?.traceId,
    route: options.metadata?.route
  };
}

function wrapStreamWithUsage(
  stream: ReadableStream<string>,
  onDone: (tokensOut: number) => Promise<void> | void
): ReadableStream<string> {
  const reader = stream.getReader();
  let outputLength = 0;

  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        await onDone(estimateTokensFromLength(outputLength));
        controller.close();
        return;
      }
      if (value) {
        outputLength += value.length;
        controller.enqueue(value);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await onDone(estimateTokensFromLength(outputLength));
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
  const estimatedTokensIn = estimateTokensFromMessages(messages);
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
    const startedAt = Date.now();
    try {
      const result = await (
        env.AI as unknown as {
          run: (model: string, input: unknown, options: unknown) => Promise<unknown>;
        }
      ).run(candidate, input, runOptions);
      const latencyMs = Date.now() - startedAt;
      const usage = extractUsageTokens(result);
      const resolvedTokensIn = usage.tokensIn ?? estimatedTokensIn;

      if (options.stream) {
        if (isReadableStream(result)) {
          const wrapped = wrapStreamWithUsage(aiStreamToTokenStream(result), async (tokensOut) => {
            if (options.onUsage) {
              await options.onUsage(
                buildUsageMetrics(
                  tenantId,
                  gatewayId,
                  candidate,
                  latencyMs,
                  true,
                  'success',
                  options,
                  resolvedTokensIn,
                  tokensOut,
                  usage.totalTokens ?? resolvedTokensIn + tokensOut
                )
              );
            }
          });
          return {
            kind: 'stream',
            modelId: candidate,
            stream: wrapped
          };
        }
        const content = extractTextResponse(result);
        const tokensOut = usage.tokensOut ?? estimateTokensFromText(content);
        if (options.onUsage) {
          await options.onUsage(
            buildUsageMetrics(
              tenantId,
              gatewayId,
              candidate,
              latencyMs,
              true,
              'success',
              options,
              resolvedTokensIn,
              tokensOut,
              usage.totalTokens ?? resolvedTokensIn + tokensOut
            )
          );
        }
        return { kind: 'stream', modelId: candidate, stream: createSingleChunkStream(content) };
      }

      const content = extractTextResponse(result);
      const tokensOut = usage.tokensOut ?? estimateTokensFromText(content);
      if (options.onUsage) {
        await options.onUsage(
          buildUsageMetrics(
            tenantId,
            gatewayId,
            candidate,
            latencyMs,
            false,
            'success',
            options,
            resolvedTokensIn,
            tokensOut,
            usage.totalTokens ?? resolvedTokensIn + tokensOut
          )
        );
      }
      return { kind: 'text', modelId: candidate, content, raw: result };
    } catch (error) {
      if (options.onUsage) {
        const latencyMs = Date.now() - startedAt;
        await options.onUsage(
          buildUsageMetrics(
            tenantId,
            gatewayId,
            candidate,
            latencyMs,
            options.stream === true,
            'error',
            options,
            estimatedTokensIn
          )
        );
      }
      lastError = error;
    }
  }

  throw lastError;
}
