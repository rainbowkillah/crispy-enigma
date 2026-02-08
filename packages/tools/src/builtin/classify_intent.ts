import type { ToolDefinition, ToolContext, ToolResult } from '../schema.js';
import {
  runGatewayChat,
  type ChatModelMessage,
} from '../../../ai/src/gateway.js';

export type ClassifyIntentParams = {
  text: string;
  categories?: string[];
};

export type ClassifyIntentOutput = {
  intent: string;
  confidence: number;
  categories_considered: string[];
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
  params: ClassifyIntentParams,
  context: ToolContext
): Promise<ToolResult<ClassifyIntentOutput>> {
  const defaultCategories = [
    'question',
    'request',
    'complaint',
    'feedback',
    'greeting',
    'other',
  ];
  const categories = params.categories?.length
    ? params.categories
    : defaultCategories;

  const messages: ChatModelMessage[] = [
    {
      role: 'system',
      content: `You are an intent classification assistant. Classify the user's text into one of the following categories: ${categories.join(', ')}. Return only valid JSON with keys: intent (string), confidence (number 0-1). No extra text.`,
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
      data: {
        intent: 'other',
        confidence: 0,
        categories_considered: categories,
      },
    };
  }

  const record = parsed as Record<string, unknown>;
  const intent =
    typeof record.intent === 'string' && categories.includes(record.intent)
      ? record.intent
      : 'other';
  const confidence =
    typeof record.confidence === 'number'
      ? Math.max(0, Math.min(1, record.confidence))
      : 0;

  return {
    success: true,
    data: {
      intent,
      confidence,
      categories_considered: categories,
    },
  };
}

export const classifyIntentTool: ToolDefinition<
  ClassifyIntentParams,
  ClassifyIntentOutput
> = {
  name: 'classify_intent',
  description: 'Classify the intent of a text message into predefined categories',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to classify',
        minLength: 1,
        maxLength: 10000,
      },
      categories: {
        type: 'array',
        description: 'Custom categories to classify into',
        items: { type: 'string' },
      },
    },
    required: ['text'],
  },
  output: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'The classified intent' },
      confidence: {
        type: 'number',
        description: 'Confidence score from 0 to 1',
      },
      categories_considered: {
        type: 'array',
        description: 'Categories that were considered',
        items: { type: 'string' },
      },
    },
  },
  handler,
  timeout: 30000,
};
