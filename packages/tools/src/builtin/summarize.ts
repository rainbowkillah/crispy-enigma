import type { ToolDefinition, ToolContext, ToolResult } from '../schema.js';
import {
  runGatewayChat,
  type ChatModelMessage,
} from '../../../ai/src/gateway.js';

export type SummarizeParams = {
  text: string;
  max_length?: number;
  format?: 'bullet_points' | 'paragraph';
};

export type SummarizeOutput = {
  summary: string;
  format: string;
};

async function handler(
  params: SummarizeParams,
  context: ToolContext
): Promise<ToolResult<SummarizeOutput>> {
  const format = params.format ?? 'paragraph';
  const maxLength = params.max_length ?? 500;

  const formatInstruction =
    format === 'bullet_points'
      ? 'Format the summary as concise bullet points.'
      : 'Format the summary as a single coherent paragraph.';

  const messages: ChatModelMessage[] = [
    {
      role: 'system',
      content: `You are a precise summarization assistant. Summarize the given text in no more than ${maxLength} characters. ${formatInstruction} Return only the summary, no extra text.`,
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

  return {
    success: true,
    data: {
      summary: result.content.trim(),
      format,
    },
  };
}

export const summarizeTool: ToolDefinition<SummarizeParams, SummarizeOutput> = {
  name: 'summarize',
  description: 'Summarize text into a concise format (bullet points or paragraph)',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to summarize',
        minLength: 1,
        maxLength: 100000,
      },
      max_length: {
        type: 'integer',
        description: 'Maximum length of the summary in characters',
        minimum: 50,
        maximum: 5000,
      },
      format: {
        type: 'string',
        description: 'Output format for the summary',
        enum: ['bullet_points', 'paragraph'],
      },
    },
    required: ['text'],
  },
  output: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'The generated summary' },
      format: { type: 'string', description: 'The format used' },
    },
  },
  handler,
  timeout: 30000,
};
