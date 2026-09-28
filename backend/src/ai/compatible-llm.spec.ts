import { createCompatibleLlm, extractJsonObject } from './compatible-llm';

const env =
  (values: Record<string, string>) =>
  (key: string): string | undefined =>
    values[key];

const reply = (body: unknown, status = 200) =>
  jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('createCompatibleLlm', () => {
  it('is off unless base URL, key and model are all set', () => {
    expect(createCompatibleLlm(env({ AI_BASE_URL: 'https://x/v1', AI_API_KEY: 'k' }))).toBeNull();
    expect(createCompatibleLlm(env({}))).toBeNull();
  });

  it('speaks OpenAI chat completions by default', async () => {
    const fetchMock = reply({ choices: [{ message: { content: '{"allergy":"Không"}' } }] });
    const llm = createCompatibleLlm(
      env({ AI_BASE_URL: 'https://api.xkiro.test/v1/', AI_API_KEY: 'sk-1', AI_MODEL: 'claude-x' }),
      fetchMock,
    )!;
    await expect(llm.complete('sys', 'user', 100)).resolves.toBe('{"allergy":"Không"}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.xkiro.test/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-1');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'claude-x',
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'user' },
      ],
    });
  });

  it('speaks the Anthropic messages format when asked', async () => {
    const fetchMock = reply({ content: [{ type: 'text', text: 'ok' }] });
    const llm = createCompatibleLlm(
      env({
        AI_BASE_URL: 'https://gw.test',
        AI_API_KEY: 'k-2',
        AI_MODEL: 'claude-y',
        AI_API_FORMAT: 'Anthropic',
      }),
      fetchMock,
    )!;
    await expect(llm.complete('sys', 'user', 50)).resolves.toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.test/v1/messages');
    expect(init.headers['x-api-key']).toBe('k-2');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(init.body)).toMatchObject({
      system: 'sys',
      messages: [{ role: 'user', content: 'user' }],
    });
  });

  it('reports gateway errors without echoing the key', async () => {
    const fetchMock = reply({ error: 'bad key sk-secret' }, 401);
    const llm = createCompatibleLlm(
      env({ AI_BASE_URL: 'https://gw.test/v1', AI_API_KEY: 'sk-secret', AI_MODEL: 'm' }),
      fetchMock,
    )!;
    const failure = llm.complete('s', 'u', 10);
    await expect(failure).rejects.toThrow('AI gateway 401');
    await expect(failure).rejects.not.toThrow('sk-secret');
  });

  it('rejects an empty answer', async () => {
    const llm = createCompatibleLlm(
      env({ AI_BASE_URL: 'https://gw.test/v1', AI_API_KEY: 'k', AI_MODEL: 'm' }),
      reply({ choices: [{ message: { content: '  ' } }] }),
    )!;
    await expect(llm.complete('s', 'u', 10)).rejects.toThrow('Empty AI gateway response');
  });
});

describe('extractJsonObject', () => {
  it('reads JSON wrapped in fences or prose', () => {
    expect(extractJsonObject('```json\n{"next":"Tái khám"}\n```')).toEqual({ next: 'Tái khám' });
    expect(extractJsonObject('Đây là kết quả: {"open":"Không"} xong.')).toEqual({ open: 'Không' });
    expect(() => extractJsonObject('không có json')).toThrow('No JSON object');
  });
});
