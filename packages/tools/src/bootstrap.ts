import { hasTool, registerTool } from './registry.js';
import { summarizeTool } from './builtin/summarize.js';
import { extractEntitiesTool } from './builtin/extract_entities.js';
import { classifyIntentTool } from './builtin/classify_intent.js';
import { tagChunkDocsTool } from './builtin/tag_chunk_docs.js';
import { ingestDocsTool } from './builtin/ingest_docs.js';
import type { ToolDefinition } from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const builtinTools: ToolDefinition<any, any>[] = [
  summarizeTool,
  extractEntitiesTool,
  classifyIntentTool,
  tagChunkDocsTool,
  ingestDocsTool,
];

let bootstrapped = false;

export function bootstrapTools(): void {
  if (bootstrapped) {
    return;
  }
  for (const tool of builtinTools) {
    if (!hasTool(tool.name)) {
      registerTool(tool);
    }
  }
  bootstrapped = true;
}
