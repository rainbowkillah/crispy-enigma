import type { ToolDefinition, ToolContext, ToolResult } from '../schema.js';
import {
  runGatewayChat,
  type ChatModelMessage,
} from '../../../ai/src/gateway.js';

export type ExtractEntitiesParams = {
  text: string;
  entity_types?: string[];
};

export type Entity = {
  text: string;
  type: string;
  start_offset: number;
  end_offset: number;
};

export type ExtractEntitiesOutput = {
  entities: Entity[];
  count: number;
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
  params: ExtractEntitiesParams,
  context: ToolContext
): Promise<ToolResult<ExtractEntitiesOutput>> {
  const entityTypesHint = params.entity_types?.length
    ? `Focus on these entity types: ${params.entity_types.join(', ')}.`
    : 'Extract all entity types (person, organization, location, date, etc.).';

  const messages: ChatModelMessage[] = [
    {
      role: 'system',
      content: `You are a named entity extraction assistant. Extract entities from the given text. ${entityTypesHint} Return only valid JSON with key "entities" containing an array of objects with keys: text, type, start_offset, end_offset. No extra text.`,
    },
    {
      role: 'user',
      content: params.text,
    },
  ];

  const modelId =
    context.chatModelId ??
    context.env.MODEL_ID ??
    '@cf/meta/llama-3.1-8b-instruct';
  const gatewayId = context.aiGatewayId ?? 'default';

  const result = await runGatewayChat(
    context.tenantId,
    gatewayId,
    modelId,
    messages,
    context.env,
    { stream: false }
  );

  if (result.kind !== 'text') {
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_RESPONSE',
        message: 'Expected text response from AI',
      },
    };
  }

  const parsed = extractJsonObject(result.content);
  if (!parsed || typeof parsed !== 'object') {
    return {
      success: true,
      data: { entities: [], count: 0 },
    };
  }

  const raw = (parsed as Record<string, unknown>).entities;
  if (!Array.isArray(raw)) {
    return {
      success: true,
      data: { entities: [], count: 0 },
    };
  }

  const entities: Entity[] = raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null
    )
    .map((item) => ({
      text: String(item.text ?? ''),
      type: String(item.type ?? 'unknown'),
      start_offset:
        typeof item.start_offset === 'number' ? item.start_offset : 0,
      end_offset: typeof item.end_offset === 'number' ? item.end_offset : 0,
    }))
    .filter((e) => e.text.length > 0);

  return {
    success: true,
    data: { entities, count: entities.length },
  };
}

export const extractEntitiesTool: ToolDefinition<
  ExtractEntitiesParams,
  ExtractEntitiesOutput
> = {
  name: 'extract_entities',
  description: 'Extract named entities (people, places, orgs, dates) from text',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to extract entities from',
        minLength: 1,
        maxLength: 100000,
      },
      entity_types: {
        type: 'array',
        description: 'Specific entity types to extract',
        items: { type: 'string' },
      },
    },
    required: ['text'],
  },
  output: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        description: 'Extracted entities',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            type: { type: 'string' },
            start_offset: { type: 'integer' },
            end_offset: { type: 'integer' },
          },
        },
      },
      count: { type: 'integer', description: 'Number of entities found' },
    },
  },
  handler,
  timeout: 30000,
};
