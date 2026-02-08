import type { ToolDefinition, ToolContext, ToolResult } from '../schema.js';
import { chunkText } from '../../../rag/src/chunking.js';
import {
  runGatewayChat,
  type ChatModelMessage,
} from '../../../ai/src/gateway.js';

export type TagChunkDocsParams = {
  content: string;
  chunk_size?: number;
  metadata?: Record<string, string>;
};

export type TaggedChunk = {
  index: number;
  text: string;
  tags: string[];
  start_offset: number;
  end_offset: number;
};

export type TagChunkDocsOutput = {
  chunks: TaggedChunk[];
  chunk_count: number;
};

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
}

function extractJsonObject(text: string): unknown | null {
  const stripped = stripMarkdownFences(text.trim());
  const trimmed = stripped.trim();
  const candidate =
    trimmed.startsWith('{') && trimmed.endsWith('}')
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function handler(
  params: TagChunkDocsParams,
  context: ToolContext
): Promise<ToolResult<TagChunkDocsOutput>> {
  const chunks = chunkText(params.content, {
    maxChunkSize: params.chunk_size,
  });

  if (chunks.length === 0) {
    return {
      success: true,
      data: { chunks: [], chunk_count: 0 },
    };
  }

  const modelId =
    context.chatModelId ??
    context.env.MODEL_ID ??
    '@cf/meta/llama-3.1-8b-instruct';
  const gatewayId = context.aiGatewayId ?? 'default';

  const CONCURRENCY = 5;

  async function tagChunk(chunk: typeof chunks[number]): Promise<TaggedChunk> {
    const messages: ChatModelMessage[] = [
      {
        role: 'system',
        content:
          'You are a document tagging assistant. Given a text chunk, return a JSON object with key "tags" containing an array of relevant topic tags (3-7 tags). Tags should be lowercase, single words or short phrases. Return only valid JSON, no extra text.',
      },
      {
        role: 'user',
        content: chunk.text,
      },
    ];

    let tags: string[] = [];
    try {
      const result = await runGatewayChat(
        context.tenantId,
        gatewayId,
        modelId,
        messages,
        context.env,
        { stream: false }
      );

      if (result.kind === 'text') {
        const parsed = extractJsonObject(result.content);
        if (parsed && typeof parsed === 'object') {
          const rawTags = (parsed as Record<string, unknown>).tags;
          if (Array.isArray(rawTags)) {
            tags = rawTags
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim().toLowerCase())
              .filter((t) => t.length > 0);
          }
        }
      }
    } catch {
      // Tag extraction failed for this chunk; continue with empty tags.
    }

    return {
      index: chunk.index,
      text: chunk.text,
      tags,
      start_offset: chunk.startOffset,
      end_offset: chunk.endOffset,
    };
  }

  // Process chunks in parallel with bounded concurrency
  const taggedChunks: TaggedChunk[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(tagChunk));
    taggedChunks.push(...results);
  }

  return {
    success: true,
    data: {
      chunks: taggedChunks,
      chunk_count: taggedChunks.length,
    },
  };
}

export const tagChunkDocsTool: ToolDefinition<
  TagChunkDocsParams,
  TagChunkDocsOutput
> = {
  name: 'tag_chunk_docs',
  description: 'Chunk a document into pieces and tag each chunk with topic labels',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The document content to chunk and tag',
        minLength: 1,
        maxLength: 500000,
      },
      chunk_size: {
        type: 'integer',
        description: 'Maximum chunk size in characters',
        minimum: 100,
        maximum: 10000,
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata to attach',
        properties: {},
      },
    },
    required: ['content'],
  },
  output: {
    type: 'object',
    properties: {
      chunks: {
        type: 'array',
        description: 'Tagged chunks',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            text: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            start_offset: { type: 'integer' },
            end_offset: { type: 'integer' },
          },
        },
      },
      chunk_count: {
        type: 'integer',
        description: 'Number of chunks produced',
      },
    },
  },
  handler,
  timeout: 30000,
};
