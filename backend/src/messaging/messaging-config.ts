/**
 * SMS / Zalo sending is configured by env; both are off until the clinic
 * turns them on. "mock" writes the message to the log without sending, to
 * try the flow before a provider is signed up.
 *
 *   SMS_PROVIDER   off | mock | esms   (eSMS.vn: ESMS_API_KEY, ESMS_SECRET_KEY, ESMS_BRANDNAME)
 *   ZALO_PROVIDER  off | mock | zns    (Zalo ZNS: ZALO_OA_ACCESS_TOKEN,
 *                                       ZALO_ZNS_TEMPLATE_VISIT_REMINDER, ZALO_ZNS_TEMPLATE_RECALL_REMINDER)
 *   MESSAGING_VISIT_REMINDERS / MESSAGING_RECALL_REMINDERS  true (default) | false
 */
export type SmsProviderName = 'off' | 'mock' | 'esms';
export type ZaloProviderName = 'off' | 'mock' | 'zns';

export interface MessagingConfig {
  sms: SmsProviderName;
  zalo: ZaloProviderName;
  visitReminders: boolean;
  recallReminders: boolean;
}

const pick = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T => {
  const v = value?.trim().toLowerCase() as T | undefined;
  return v && allowed.includes(v) ? v : fallback;
};

export function readMessagingConfig(env: NodeJS.ProcessEnv = process.env): MessagingConfig {
  return {
    sms: pick(env.SMS_PROVIDER, ['off', 'mock', 'esms'] as const, 'off'),
    zalo: pick(env.ZALO_PROVIDER, ['off', 'mock', 'zns'] as const, 'off'),
    visitReminders: env.MESSAGING_VISIT_REMINDERS?.trim().toLowerCase() !== 'false',
    recallReminders: env.MESSAGING_RECALL_REMINDERS?.trim().toLowerCase() !== 'false',
  };
}

export function anyPhoneChannel(config: MessagingConfig): boolean {
  return config.sms !== 'off' || config.zalo !== 'off';
}

/** What a configured provider is missing (shown to the admin, logged at startup). */
export function messagingConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const config = readMessagingConfig(env);
  const problems: string[] = [];
  if (config.sms === 'esms') {
    for (const key of ['ESMS_API_KEY', 'ESMS_SECRET_KEY', 'ESMS_BRANDNAME']) {
      if (!env[key]?.trim()) problems.push(`SMS (eSMS): thiếu ${key}`);
    }
  }
  if (config.zalo === 'zns') {
    if (!env.ZALO_OA_ACCESS_TOKEN?.trim()) problems.push('Zalo ZNS: thiếu ZALO_OA_ACCESS_TOKEN');
    for (const key of ['ZALO_ZNS_TEMPLATE_VISIT_REMINDER', 'ZALO_ZNS_TEMPLATE_RECALL_REMINDER']) {
      if (!env[key]?.trim()) problems.push(`Zalo ZNS: thiếu ${key} (mã mẫu tin đã được duyệt)`);
    }
  }
  return problems;
}

/**
 * A Vietnamese mobile number as 0xxxxxxxxx (10 digits), from what patients
 * type (+84 / 84 prefix, spaces, dots), or null.
 */
export function normalizeVnMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('84') && digits.length === 11) digits = '0' + digits.slice(2);
  return /^0[35789]\d{8}$/.test(digits) ? digits : null;
}

/** Text without Vietnamese accents: brandname SMS is billed per 160 plain characters. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
