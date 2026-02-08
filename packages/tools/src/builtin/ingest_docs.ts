import type { ToolDefinition, ToolContext, ToolResult } from '../schema.js';
import { chunkText } from '../../../rag/src/chunking.js';
import { runGatewayEmbeddings } from '../../../rag/src/embeddings.js';
import { upsertTenantVectors } from '../../../rag/src/vectorize.js';

export type IngestDocsParams = {
  content: string;
  doc_id: string;
  source?: string;
  title?: string;
  chunk_size?: number;
  metadata?: Record<string, string>;
};

export type IngestDocsOutput = {
  doc_id: string;
  chunks_ingested: number;
  embedding_model: string;
};

async function handler(
  params: IngestDocsParams,
  context: ToolContext
): Promise<ToolResult<IngestDocsOutput>> {
  const chunks = chunkText(params.content, {
    maxChunkSize: params.chunk_size,
  });

  if (chunks.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_CONTENT',
        message: 'No content to ingest after chunking',
      },
    };
  }

  const embeddingModelId =
    context.embeddingModelId ??
    context.env.EMBEDDING_MODEL_ID ??
    '@cf/baai/bge-base-en-v1.5';
  const gatewayId = context.aiGatewayId ?? 'default';

  const embeddingsResult = await runGatewayEmbeddings(
    context.tenantId,
    gatewayId,
    embeddingModelId,
    chunks.map((c) => c.text),
    context.env,
    {
      metadata: {
        route: '/tools/execute',
        tool: 'ingest_docs',
      },
    }
  );

  const snippetLength = 512;
  const records = chunks.map((chunk, index) => ({
    id: `${params.doc_id}:${chunk.index}`,
    values: embeddingsResult.embeddings[index] ?? [],
    metadata: {
      tenantId: context.tenantId,
      docId: params.doc_id,
      chunkId: String(chunk.index),
      source: params.source,
      title: params.title,
      text: chunk.text.slice(0, snippetLength),
      ...params.metadata,
    },
  }));

  await upsertTenantVectors(context.tenantId, context.env.VECTORIZE, records);

  return {
    success: true,
    data: {
      doc_id: params.doc_id,
      chunks_ingested: chunks.length,
      embedding_model: embeddingsResult.modelId,
    },
  };
}

export const ingestDocsTool: ToolDefinition<
  IngestDocsParams,
  IngestDocsOutput
> = {
  name: 'ingest_docs',
  description: 'Ingest a document by chunking, embedding, and storing in vector index',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The document content to ingest',
        minLength: 1,
        maxLength: 500000,
      },
      doc_id: {
        type: 'string',
        description: 'Unique identifier for the document',
        minLength: 1,
        maxLength: 256,
      },
      source: {
        type: 'string',
        description: 'Source of the document',
      },
      title: {
        type: 'string',
        description: 'Title of the document',
      },
      chunk_size: {
        type: 'integer',
        description: 'Maximum chunk size in characters',
        minimum: 100,
        maximum: 10000,
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata to store with vectors',
        properties: {},
      },
    },
    required: ['content', 'doc_id'],
  },
  output: {
    type: 'object',
    properties: {
      doc_id: { type: 'string', description: 'The document ID' },
      chunks_ingested: {
        type: 'integer',
        description: 'Number of chunks ingested',
      },
      embedding_model: {
        type: 'string',
        description: 'The embedding model used',
      },
    },
  },
  handler,
  timeout: 60000,
};
