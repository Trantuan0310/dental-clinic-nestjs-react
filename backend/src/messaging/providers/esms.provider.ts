import { MessageChannel } from '@prisma/client';
import { stripAccents } from '../messaging-config';
import { describeError, PhoneMessage, PhoneProvider, SendResult } from './phone-provider';

const ESMS_URL = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

/**
 * eSMS.vn brandname SMS (customer care, SmsType 2). The brandname and the
 * message wording must be registered with eSMS; text goes without accents.
 */
export class EsmsProvider implements PhoneProvider {
  readonly name = 'esms';
  readonly channel = MessageChannel.SMS;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(message: PhoneMessage): Promise<SendResult> {
    try {
      const res = await this.http(ESMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ApiKey: this.env.ESMS_API_KEY,
          SecretKey: this.env.ESMS_SECRET_KEY,
          Brandname: this.env.ESMS_BRANDNAME,
          SmsType: '2',
          IsUnicode: '0',
          Phone: message.phone,
          Content: stripAccents(message.text),
          RequestId: message.trackingId,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        CodeResult?: string;
        SMSID?: string;
        ErrorMessage?: string;
      };
      if (res.ok && body.CodeResult === '100') return { ok: true, providerId: body.SMSID };
      return {
        ok: false,
        error: `eSMS ${res.status} ${body.CodeResult ?? ''} ${body.ErrorMessage ?? ''}`.trim(),
      };
    } catch (error) {
      return { ok: false, error: describeError(error) };
    }
  }
}
