/**
 * Minimal MCP Streamable HTTP client (JSON-RPC 2.0 over HTTP POST).
 * Handles both application/json and text/event-stream (SSE) responses.
 * Config-driven: URL + optional bearer token from env (server-side only).
 */
import { randomUUID } from 'node:crypto';

export interface McpToolResult {
  text: string;
  parsed: unknown;
}

function parseSse(text: string): unknown {
  const events: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
    if (!data) continue;
    try {
      const j = JSON.parse(data) as { error?: unknown; result?: unknown };
      if (j.error) throw new Error(`MCP_RPC_ERROR: ${JSON.stringify(j.error)}`);
      if (j.result !== undefined) events.push(j.result);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('MCP_RPC_ERROR')) throw err;
      /* non-JSON keepalive chunks are ignored */
    }
  }
  return events[events.length - 1];
}

export class McpClient {
  private sessionId?: string;
  private initializePromise?: Promise<void>;

  constructor(
    private url: string,
    private token?: string,
  ) {}

  async listTools(): Promise<string[]> {
    await this.ensureInitialized();
    const res = (await this.request({ method: 'tools/list', params: {} })) as {
      tools?: Array<{ name: string }>;
    };
    return (res.tools ?? []).map((t) => t.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.ensureInitialized();
    const res = await this.request({ method: 'tools/call', params: { name, arguments: args } });
    const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    let parsed: unknown = res;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { text, parsed };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.sessionId) return;
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await this.request({
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'TFast Ads Manager', version: '0.1.0' },
          },
        }, true);
        await this.notify('notifications/initialized');
      })().catch((error) => {
        this.sessionId = undefined;
        this.initializePromise = undefined;
        throw error;
      });
    }
    await this.initializePromise;
  }

  private async notify(method: string): Promise<void> {
    await this.send({ jsonrpc: '2.0', method }, false);
  }

  private async request(body: Record<string, unknown>, initializing = false): Promise<unknown> {
    return this.send({ jsonrpc: '2.0', id: randomUUID(), ...body }, initializing);
  }

  private async send(payload: Record<string, unknown>, initializing: boolean): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-03-26',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const returnedSession = res.headers.get('mcp-session-id');
    if (initializing && returnedSession) this.sessionId = returnedSession;
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      throw new Error(`MCP_HTTP_ERROR ${res.status}: ${detail}`);
    }
    if (res.status === 202 || res.status === 204) return {};
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream')) return parseSse(await res.text());
    if (!ct.includes('application/json')) {
      const text = await res.text();
      if (!text.trim()) return {};
      throw new Error(`MCP_CONTENT_TYPE_ERROR: expected JSON or SSE, received ${ct || 'unknown'}`);
    }
    const json = (await res.json()) as { error?: unknown; result?: unknown };
    if (json.error) throw new Error(`MCP_RPC_ERROR: ${JSON.stringify(json.error)}`);
    return json.result;
  }
}
