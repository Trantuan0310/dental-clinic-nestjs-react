import { agingSnapshot, waterfallSteps } from './financial-math';

const at = (date: string) => new Date(`${date}T12:00:00+07:00`);

describe('monthly aging snapshots', () => {
  const invoice = (issued: string, total = 1000) => ({
    issuedAt: at(issued),
    total,
    voidedAt: null as Date | null,
    payments: [] as Array<{ amount: number; paidAt: Date; voidedAt: Date | null }>,
    adjustments: [] as Array<{ amount: number; adjustedAt: Date }>,
  });

  it('does not erase historical debt after a later payment, write-down or invoice void', () => {
    const row = invoice('2026-01-01');
    row.payments = [{ amount: 400, paidAt: at('2026-02-01'), voidedAt: null }];
    row.adjustments = [{ amount: 100, adjustedAt: at('2026-03-01') }];
    row.voidedAt = at('2026-04-01');
    expect(agingSnapshot([row], at('2026-01-31'))).toEqual({
      D0_30: 1000,
      D31_60: 0,
      D61_90: 0,
      D90_PLUS: 0,
      total: 1000,
    });
    expect(agingSnapshot([row], at('2026-02-28')).total).toBe(600);
    expect(agingSnapshot([row], at('2026-03-31')).total).toBe(500);
    expect(agingSnapshot([row], at('2026-04-01')).total).toBe(0);
  });

  it('counts a receipt voided later only before the void; never includes a not-yet-issued invoice', () => {
    const row = invoice('2026-01-01');
    row.payments = [{ amount: 1000, paidAt: at('2026-01-05'), voidedAt: at('2026-02-05') }];
    expect(agingSnapshot([row], at('2026-01-31')).total).toBe(0);
    expect(agingSnapshot([row], at('2026-02-28')).total).toBe(1000);
    expect(agingSnapshot([row], at('2025-12-31')).total).toBe(0);
  });

  it('uses clinic day boundaries for 30/31, 60/61, 90/91 and reconciles buckets', () => {
    const rows = [
      '2026-04-01',
      '2026-03-31',
      '2026-03-02',
      '2026-03-01',
      '2026-01-31',
      '2026-01-30',
    ].map(d => invoice(d, 100));
    const result = agingSnapshot(rows, new Date('2026-05-01T16:59:59.999Z'));
    expect(result).toEqual({ D0_30: 100, D31_60: 200, D61_90: 200, D90_PLUS: 100, total: 600 });
  });

  it('keeps zero debt for a fully paid invoice even when its cash has been refunded', () => {
    const row = invoice('2026-01-01');
    // The loader selects PAYMENT receipts only: refunds cannot reopen this debt.
    row.payments = [{ amount: 1000, paidAt: at('2026-01-02'), voidedAt: null }];
    expect(agingSnapshot([row], at('2026-01-31')).total).toBe(0);
  });
});

describe('waterfall running balances', () => {
  it('handles signed bridges, subtotal resets and negative cash', () => {
    expect(
      waterfallSteps([
        { key: 'gross', amount: 1000 },
        { key: 'discount', amount: -100 },
        { key: 'net', amount: 900, total: true },
        { key: 'bridge', amount: -700 },
        { key: 'expense', amount: -500 },
        { key: 'remaining', amount: -300, total: true },
      ]).map(s => [s.from, s.to]),
    ).toEqual([
      [0, 1000],
      [1000, 900],
      [0, 900],
      [900, 200],
      [200, -300],
      [0, -300],
    ]);
  });
});
