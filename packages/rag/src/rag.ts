export type RagChunkMetadata = {
  tenantId: string;
  docId: string;
  chunkId: string;
  source?: string;
  title?: string;
  url?: string;
};

export type RagChunk = {
  id: string;
  text: string;
  metadata: RagChunkMetadata;
  score?: number;
};

export type RagCitation = {
  id: string;
  docId: string;
  chunkId: string;
  source?: string;
  title?: string;
  url?: string;
};

export type RagPromptTemplate = {
  system?: string;
  instruction?: string;
};

export type RagSafetyResult = {
  allowed: boolean;
  reason?: string;
};

const BLOCKED_TERMS = ['self-harm', 'suicide', 'kill myself'];

export function applySafetyFilter(question: string): RagSafetyResult {
  const normalized = question.toLowerCase();
  const matched = BLOCKED_TERMS.find((term) => normalized.includes(term));
  if (matched) {
    return { allowed: false, reason: `blocked_term:${matched}` };
  }
  return { allowed: true };
}

export type RagAssemblyResult = {
  prompt: string;
  question: string;
  context: RagChunk[];
  citations: RagCitation[];
  citationsText: string;
  safety?: RagSafetyResult;
};

const DEFAULT_SYSTEM =
  'You are a helpful assistant. Use the provided context to answer the question.';
const DEFAULT_INSTRUCTION =
  'If the answer is not in the context, say you do not know. Cite sources using [source:docId#chunkId].';

function buildCitations(chunks: RagChunk[]): RagCitation[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    docId: chunk.metadata.docId,
    chunkId: chunk.metadata.chunkId,
    source: chunk.metadata.source,
    title: chunk.metadata.title,
    url: chunk.metadata.url
  }));
}

function formatContext(chunks: RagChunk[]): string {
  return chunks
    .map((chunk) => {
      const ref = `[source:${chunk.metadata.docId}#${chunk.metadata.chunkId}]`;
      return `${ref} ${chunk.text}`;
    })
    .join('\n\n');
}

function formatCitations(citations: RagCitation[]): string {
  if (citations.length === 0) {
    return '(no sources)';
  }
  return citations
    .map((citation) => {
      const label = `${citation.docId}#${citation.chunkId}`;
      const source = citation.source ? ` (${citation.source})` : '';
      return `- ${label}${source}`;
    })
    .join('\n');
}

export function assembleRagPrompt(
  question: string,
  chunks: RagChunk[],
  template: RagPromptTemplate = {}
): RagAssemblyResult {
  const safety = applySafetyFilter(question);
  if (!safety.allowed) {
    return {
      prompt: '',
      question,
      context: [],
      citations: [],
      citationsText: '(blocked)',
      safety
    };
  }

  const system = template.system ?? DEFAULT_SYSTEM;
  const instruction = template.instruction ?? DEFAULT_INSTRUCTION;
  const context = formatContext(chunks);

  const prompt = [
    `System: ${system}`,
    `Instruction: ${instruction}`,
    'Context:',
    context || '(no context)',
    `Question: ${question}`
  ].join('\n');

  const citations = buildCitations(chunks);
  return {
    prompt,
    question,
    context: chunks,
    citations,
    citationsText: formatCitations(citations),
    safety
  };
}
