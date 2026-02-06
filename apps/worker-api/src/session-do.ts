type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  tokenCount?: number;
};

export type RetentionOptions = {
  now: number;
  retentionDays: number;
  maxMessages: number;
};

export function pruneMessages(
  messages: ChatMessage[],
  options: RetentionOptions
): ChatMessage[] {
  const cutoff = options.now - options.retentionDays * 24 * 60 * 60 * 1000;
  const filtered = messages
    .filter((message) => message.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (filtered.length <= options.maxMessages) {
    return filtered;
  }
  return filtered.slice(filtered.length - options.maxMessages);
}

type AppendRequest = {
  role: ChatRole;
  content: string;
  tokenCount?: number;
  retentionDays?: number;
  maxMessages?: number;
};

type HistoryRequest = {
  limit?: number;
  retentionDays?: number;
  maxMessages?: number;
};

export class ChatSession {
  constructor(private state: DurableObjectState) {}

  private async loadMessages(): Promise<ChatMessage[]> {
    const stored = await this.state.storage.get<ChatMessage[]>('messages');
    return stored ?? [];
  }

  private async saveMessages(messages: ChatMessage[]): Promise<void> {
    await this.state.storage.put('messages', messages);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/append' && request.method === 'POST') {
      const body = (await request.json()) as AppendRequest;
      const messages = await this.loadMessages();
      const now = Date.now();
      const retentionDays = body.retentionDays ?? 30;
      const maxMessages = body.maxMessages ?? 1000;

      const nextMessages = pruneMessages(messages, {
        now,
        retentionDays,
        maxMessages
      });

      nextMessages.push({
        role: body.role,
        content: body.content,
        timestamp: now,
        tokenCount: body.tokenCount
      });

      const trimmed = pruneMessages(nextMessages, {
        now,
        retentionDays,
        maxMessages
      });

      await this.saveMessages(trimmed);
      return new Response(JSON.stringify({ ok: true }));
    }

    if (url.pathname === '/history') {
      const body =
        request.method === 'POST'
          ? ((await request.json()) as HistoryRequest)
          : {};
      const messages = await this.loadMessages();
      const now = Date.now();
      const retentionDays = body.retentionDays ?? 30;
      const maxMessages = body.maxMessages ?? 1000;
      const limit = body.limit ?? maxMessages;

      const trimmed = pruneMessages(messages, {
        now,
        retentionDays,
        maxMessages
      });

      if (trimmed.length !== messages.length) {
        await this.saveMessages(trimmed);
      }

      const newestFirst = trimmed.slice().reverse().slice(0, limit);
      return new Response(JSON.stringify(newestFirst), {
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.pathname === '/clear' && request.method === 'DELETE') {
      await this.saveMessages([]);
      return new Response(JSON.stringify({ ok: true }));
    }

    return new Response('Not found', { status: 404 });
  }
}
