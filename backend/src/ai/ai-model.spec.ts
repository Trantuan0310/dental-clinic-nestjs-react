import { AiModel } from './ai-model';

const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as never;

function gatewayReplying(content: string) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response);
}

describe('AiModel.jsonOrText', () => {
  const gateway = { AI_BASE_URL: 'http://gw/v1', AI_API_KEY: 'k', AI_MODEL: 'm' };
  afterEach(() => jest.restoreAllMocks());

  it('returns the JSON object when there is one, even after a sentence', async () => {
    gatewayReplying('Đây: {"reply":"Xin chào"}');
    const out = await new AiModel(config(gateway)).jsonOrText('sys', 'user', 100);
    expect(out?.data).toEqual({ reply: 'Xin chào' });
  });

  it('uses plain words as the reply when the model answers without JSON', async () => {
    gatewayReplying('Hôm nay có 3 lịch hẹn.');
    const out = await new AiModel(config(gateway)).jsonOrText('sys', 'user', 100);
    expect(out?.data).toEqual({ reply: 'Hôm nay có 3 lịch hẹn.' });
    expect(out?.source).toBe('llm');
  });

  it('still throws on a gateway error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'blocked',
    } as Response);
    await expect(new AiModel(config(gateway)).jsonOrText('s', 'u', 10)).rejects.toThrow('403');
  });

  it('is null when no model is configured', async () => {
    expect(await new AiModel(config({})).jsonOrText('s', 'u', 10)).toBeNull();
  });
});
