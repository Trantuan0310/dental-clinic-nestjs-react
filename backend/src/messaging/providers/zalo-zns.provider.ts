import { MessageChannel } from '@prisma/client';
import {
  describeError,
  MessageTemplate,
  PhoneMessage,
  PhoneProvider,
  SendResult,
} from './phone-provider';

const ZNS_URL = 'https://business.openapi.zalo.me/message/template';

const TEMPLATE_ENV: Record<MessageTemplate, string> = {
  VISIT_REMINDER: 'ZALO_ZNS_TEMPLATE_VISIT_REMINDER',
  RECALL_REMINDER: 'ZALO_ZNS_TEMPLATE_RECALL_REMINDER',
  TEST: 'ZALO_ZNS_TEMPLATE_VISIT_REMINDER',
};

/**
 * Zalo Notification Service: a template approved by Zalo, filled with the
 * message params. The OA access token expires; the clinic renews it in the
 * Zalo developer console and updates ZALO_OA_ACCESS_TOKEN.
 */
export class ZaloZnsProvider implements PhoneProvider {
  readonly name = 'zns';
  readonly channel = MessageChannel.ZALO;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(message: PhoneMessage): Promise<SendResult> {
    const templateId = this.env[TEMPLATE_ENV[message.template]]?.trim();
    if (!templateId) return { ok: false, error: `Chưa cấu hình ${TEMPLATE_ENV[message.template]}` };
    try {
      const res = await this.http(ZNS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: this.env.ZALO_OA_ACCESS_TOKEN ?? '',
        },
        body: JSON.stringify({
          // ZNS wants 84xxxxxxxxx.
          phone: '84' + message.phone.slice(1),
          template_id: templateId,
          template_data: message.params,
          tracking_id: message.trackingId,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: number;
        message?: string;
        data?: { msg_id?: string };
      };
      if (res.ok && body.error === 0) return { ok: true, providerId: body.data?.msg_id };
      return {
        ok: false,
        error: `Zalo ${res.status} ${body.error ?? ''} ${body.message ?? ''}`.trim(),
      };
    } catch (error) {
      return { ok: false, error: describeError(error) };
    }
  }
}
