export type ChunkingOptions = {
  maxChunkSize?: number;
  overlap?: number;
};

export type TextChunk = {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  startWord: number;
  endWord: number;
};

const DEFAULT_MAX_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 100;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildWordOffsets(words: string[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const word of words) {
    offsets.push(cursor);
    cursor += word.length + 1;
  }
  return offsets;
}

function findNextStartIndex(wordOffsets: number[], targetOffset: number): number {
  let candidate = 0;
  for (let i = 0; i < wordOffsets.length; i += 1) {
    if (wordOffsets[i] > targetOffset) {
      return Math.max(0, i - 1);
    }
    candidate = i;
  }
  return candidate;
}

export function chunkText(input: string, options: ChunkingOptions = {}): TextChunk[] {
  const maxChunkSize = options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlap = Math.max(0, options.overlap ?? DEFAULT_OVERLAP);

  if (!input || maxChunkSize <= 0) {
    return [];
  }

  const normalized = normalizeText(input);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ');
  const wordOffsets = buildWordOffsets(words);
  const chunks: TextChunk[] = [];
  let index = 0;
  let startWord = 0;

  while (startWord < words.length) {
    if (words[startWord].length > maxChunkSize) {
      const word = words[startWord];
      const startOffset = wordOffsets[startWord];
      for (let offset = 0; offset < word.length; offset += maxChunkSize) {
        const piece = word.slice(offset, offset + maxChunkSize);
        chunks.push({
          index,
          text: piece,
          startOffset: startOffset + offset,
          endOffset: startOffset + offset + piece.length,
          startWord,
          endWord: startWord + 1
        });
        index += 1;
      }
      startWord += 1;
      continue;
    }

    let endWord = startWord;
    let length = 0;

    while (endWord < words.length) {
      const nextWord = words[endWord];
      const nextLength = length === 0 ? nextWord.length : length + 1 + nextWord.length;
      if (nextLength > maxChunkSize && length > 0) {
        break;
      }
      length = nextLength;
      endWord += 1;
      if (length >= maxChunkSize) {
        break;
      }
    }

    const chunkTextValue = words.slice(startWord, endWord).join(' ');
    const startOffset = wordOffsets[startWord];
    const endOffset = startOffset + chunkTextValue.length;

    chunks.push({
      index,
      text: chunkTextValue,
      startOffset,
      endOffset,
      startWord,
      endWord
    });
    index += 1;

    if (endWord >= words.length) {
      break;
    }

    const overlapStart = Math.max(startOffset, endOffset - overlap);
    const nextStart = findNextStartIndex(wordOffsets, overlapStart);
    if (nextStart <= startWord) {
      startWord = endWord;
    } else {
      startWord = nextStart;
    }
  }

  return chunks;
}
