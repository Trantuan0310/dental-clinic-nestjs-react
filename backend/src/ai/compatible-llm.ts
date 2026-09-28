/**
 * A chat model behind a third-party gateway (e.g. xkiro, OpenRouter, a local
 * proxy). Most gateways speak the OpenAI Chat Completions format; some expose
 * the Anthropic Messages format instead. Configured with:
 *
 *   AI_BASE_URL    https://gateway.example/v1   (required)
 *   AI_API_KEY     the gateway key               (required)
 *   AI_MODEL       the model name the gateway expects (required)
 *   AI_API_FORMAT  openai (default) | anthropic
 *
 * When AI_BASE_URL is set this takes precedence over GEMINI_API_KEY.
 */
export type ApiFormat = 'openai' | 'anthropic';

export interface CompatibleLlm {
  readonly model: string;
  readonly format: ApiFormat;
  /** Returns the model's text reply; throws on HTTP errors, timeouts or an empty answer. */
  complete(system: string, user: string, maxTokens: number): Promise<string>;
}

const TIMEOUT_MS = 20_000;

export function createCompatibleLlm(
  get: (key: string) => string | undefined,
  fetchImpl: typeof fetch = fetch,
): CompatibleLlm | null {
  const base = get('AI_BASE_URL')?.trim().replace(/\/+$/, '');
  const key = get('AI_API_KEY')?.trim();
  const model = get('AI_MODEL')?.trim();
  if (!base || !key || !model) return null;
  const format: ApiFormat =
    get('AI_API_FORMAT')?.trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';

  const url =
    format === 'openai'
      ? base.endsWith('/chat/completions')
        ? base
        : `${base}/chat/completions`
      : base.endsWith('/messages')
        ? base
        : base.endsWith('/v1')
          ? `${base}/messages`
          : `${base}/v1/messages`;

  return {
    model,
    format,
    async complete(system, user, maxTokens) {
      const body =
        format === 'openai'
          ? {
              model,
              temperature: 0.2,
              max_tokens: maxTokens,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            }
          : {
              model,
              temperature: 0.2,
              max_tokens: maxTokens,
              system,
              messages: [{ role: 'user', content: user }],
            };
      const headers: Record<string, string> =
        format === 'openai'
          ? { 'content-type': 'application/json', authorization: `Bearer ${key}` }
          : {
              'content-type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            };

      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // The body may echo the request; keep only a short, key-free excerpt.
        const detail = (await res.text().catch(() => '')).slice(0, 200).replace(key, '***');
        throw new Error(`AI gateway ${res.status}: ${detail}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        content?: Array<{ type?: string; text?: string }>;
      };
      const text =
        format === 'openai'
          ? data.choices?.[0]?.message?.content
          : data.content?.find(part => part.type === 'text')?.text;
      if (!text?.trim()) throw new Error('Empty AI gateway response');
      return text;
    },
  };
}

/** Models behind gateways often wrap JSON in ```json fences or add a sentence; take the object. */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in AI response');
  return JSON.parse(candidate.slice(start, end + 1));
}
