/**
 * VietQR (NAPAS) payload for a bank transfer, built offline: an EMV merchant
 * QR with the NAPAS 247 "to account" service (A000000727, QRIBFTTA). The
 * patient's banking app reads the account, amount and transfer note from it,
 * so the front desk no longer retypes them. Nothing is sent to a third party.
 *
 * Fields (docs/11_Improvement A6): 00 version, 01 static/dynamic, 38 account,
 * 53 currency (704 = VND), 54 amount, 58 country, 62 note, 63 CRC-16.
 */

export interface VietQrAccount {
  /** The bank's 6-digit NAPAS BIN, e.g. 970436 (Vietcombank). */
  bankBin: string;
  accountNo: string;
  /** For display next to the code; not part of the payload. */
  accountName: string;
}

const BIN_PATTERN = /^\d{6}$/;
const ACCOUNT_PATTERN = /^[0-9A-Za-z]{3,19}$/;
/** The note field: the code's strictest documented limit (letters, digits, spaces). */
export const MAX_CONTENT_LENGTH = 19;

/** The clinic's receiving account from VIETQR_BANK_BIN / VIETQR_ACCOUNT_NO / VIETQR_ACCOUNT_NAME, or null. */
export function vietQrAccountFromEnv(env: NodeJS.ProcessEnv = process.env): VietQrAccount | null {
  const bankBin = env.VIETQR_BANK_BIN?.trim() ?? '';
  const accountNo = env.VIETQR_ACCOUNT_NO?.replace(/\s+/g, '') ?? '';
  if (!BIN_PATTERN.test(bankBin) || !ACCOUNT_PATTERN.test(accountNo)) return null;
  return { bankBin, accountNo, accountName: env.VIETQR_ACCOUNT_NAME?.trim() ?? '' };
}

/** "Hóa đơn INV-2026/0007" → "HOA DON INV20260007", cut to the note limit. */
export function transferContent(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, MAX_CONTENT_LENGTH)
    .trim();
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as four upper-case hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** One TLV field: two-digit tag, two-digit length, value. */
function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

/**
 * The text to put in the QR. With an amount the code is "dynamic" (the app
 * opens with the amount filled); the amount is whole dong.
 */
export function buildVietQrPayload(
  account: Pick<VietQrAccount, 'bankBin' | 'accountNo'>,
  options: { amount?: number; content?: string } = {},
): string {
  const amount = options.amount && options.amount > 0 ? Math.round(options.amount) : 0;
  const content = options.content ? transferContent(options.content) : '';
  const beneficiary = tlv('00', account.bankBin) + tlv('01', account.accountNo);
  const body =
    tlv('00', '01') +
    tlv('01', amount ? '12' : '11') +
    tlv('38', tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA')) +
    tlv('53', '704') +
    (amount ? tlv('54', String(amount)) : '') +
    tlv('58', 'VN') +
    (content ? tlv('62', tlv('08', content)) : '') +
    '6304';
  return body + crc16(body);
}
