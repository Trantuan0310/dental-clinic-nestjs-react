import { InvoiceStatus } from '@prisma/client';
import { PaymentQrService } from './payment-qr.service';
import { buildVietQrPayload, crc16, transferContent, vietQrAccountFromEnv } from './vietqr';

/** Reads "TTLL…" fields back, so the test checks the structure, not a copy of it. */
function parseTlv(text: string): Array<{ tag: string; value: string }> {
  const out: Array<{ tag: string; value: string }> = [];
  for (let i = 0; i < text.length;) {
    const tag = text.slice(i, i + 2);
    const len = Number(text.slice(i + 2, i + 4));
    out.push({ tag, value: text.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

const ACCOUNT = { bankBin: '970436', accountNo: '0011004123456' };

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('buildVietQrPayload', () => {
  it('is a well-formed EMV payload that ends in its own CRC', () => {
    const payload = buildVietQrPayload(ACCOUNT, { amount: 1_250_000, content: 'INV-2026-0007' });
    const fields = parseTlv(payload);
    const get = (tag: string) => fields.find(f => f.tag === tag)?.value;

    expect(fields.map(f => f.tag)).toEqual(['00', '01', '38', '53', '54', '58', '62', '63']);
    expect(get('00')).toBe('01');
    expect(get('01')).toBe('12'); // dynamic: has an amount
    expect(get('53')).toBe('704');
    expect(get('54')).toBe('1250000');
    expect(get('58')).toBe('VN');
    expect(parseTlv(get('62')!)).toEqual([{ tag: '08', value: 'INV20260007' }]);

    const crcField = fields[fields.length - 1];
    expect(crcField.value).toBe(crc16(payload.slice(0, -4)));
    expect(payload.slice(-8, -4)).toBe('6304');
  });

  it('puts the NAPAS account service in field 38', () => {
    const payload = buildVietQrPayload(ACCOUNT, { amount: 1000 });
    const merchant = parseTlv(parseTlv(payload).find(f => f.tag === '38')!.value);
    expect(merchant[0]).toEqual({ tag: '00', value: 'A000000727' });
    expect(parseTlv(merchant[1].value)).toEqual([
      { tag: '00', value: '970436' },
      { tag: '01', value: '0011004123456' },
    ]);
    expect(merchant[2]).toEqual({ tag: '02', value: 'QRIBFTTA' });
  });

  it('is a static code without an amount, and omits the note when empty', () => {
    const fields = parseTlv(buildVietQrPayload(ACCOUNT));
    expect(fields.find(f => f.tag === '01')?.value).toBe('11');
    expect(fields.some(f => f.tag === '54' || f.tag === '62')).toBe(false);
  });

  it('rounds the amount to whole dong', () => {
    const payload = buildVietQrPayload(ACCOUNT, { amount: 99_999.6 });
    expect(parseTlv(payload).find(f => f.tag === '54')?.value).toBe('100000');
  });
});

describe('transferContent', () => {
  it('drops accents and symbols and stays within the note limit', () => {
    expect(transferContent('Hóa đơn INV-2026/0007')).toBe('HOA DON INV20260007');
    const long = transferContent('Thanh toán hóa đơn INV-2026/0007 răng sứ');
    expect(long).toBe('THANH TOAN HOA DON');
    expect(long.length).toBeLessThanOrEqual(19);
    expect(transferContent('  ')).toBe('');
  });
});

describe('vietQrAccountFromEnv', () => {
  it('needs a 6-digit BIN and a plausible account number', () => {
    expect(
      vietQrAccountFromEnv({
        VIETQR_BANK_BIN: '970436',
        VIETQR_ACCOUNT_NO: '0011 0041 23456',
        VIETQR_ACCOUNT_NAME: 'NHA KHOA GENSMILE',
      }),
    ).toEqual({
      bankBin: '970436',
      accountNo: '0011004123456',
      accountName: 'NHA KHOA GENSMILE',
    });
    expect(
      vietQrAccountFromEnv({ VIETQR_BANK_BIN: '9704', VIETQR_ACCOUNT_NO: '123456' }),
    ).toBeNull();
    expect(vietQrAccountFromEnv({ VIETQR_BANK_BIN: '970436' })).toBeNull();
    expect(vietQrAccountFromEnv({})).toBeNull();
  });
});

describe('PaymentQrService', () => {
  const actor = { sub: 'u', email: 'u@x', permissions: ['invoice.read.any'] };
  const invoice = (over: Record<string, unknown> = {}) => ({
    code: 'INV-2026-0007',
    status: InvoiceStatus.PARTIAL,
    outstandingAmount: 400_000,
    ...over,
  });
  const make = (inv: unknown) =>
    new PaymentQrService({ getInvoiceById: jest.fn().mockResolvedValue(inv) } as never);
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });
  const configure = () => {
    process.env.VIETQR_BANK_BIN = '970436';
    process.env.VIETQR_ACCOUNT_NO = '0011004123456';
    process.env.VIETQR_ACCOUNT_NAME = 'NHA KHOA GENSMILE';
  };

  it('is unconfigured until the clinic sets its account', async () => {
    delete process.env.VIETQR_BANK_BIN;
    expect(await make(invoice()).forInvoice('i', actor)).toEqual({
      configured: false,
      payable: false,
    });
  });

  it('asks for the outstanding amount, noting the invoice code', async () => {
    configure();
    const qr = await make(invoice()).forInvoice('i', actor);
    expect(qr).toMatchObject({
      configured: true,
      payable: true,
      amount: 400_000,
      content: 'INV20260007',
      accountNo: '0011004123456',
      accountName: 'NHA KHOA GENSMILE',
    });
    expect(qr.payload).toBe(
      buildVietQrPayload(
        { bankBin: '970436', accountNo: '0011004123456' },
        { amount: 400_000, content: 'INV-2026-0007' },
      ),
    );
  });

  it.each([
    [InvoiceStatus.DRAFT, 400_000],
    [InvoiceStatus.PAID, 0],
    [InvoiceStatus.VOIDED, 400_000],
    [InvoiceStatus.ISSUED, 0],
  ])('has no code for a %s invoice owing %s', async (status, outstandingAmount) => {
    configure();
    const qr = await make(invoice({ status, outstandingAmount })).forInvoice('i', actor);
    expect(qr).toEqual({ configured: true, payable: false });
  });
});
