import { BillingService } from './billing.service';

describe('missing invoice reconciliation pagination', () => {
  const count = jest.fn();
  const findMany = jest.fn();
  const prisma = {
    encounter: { count, findMany },
    $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const service = new BillingService(prisma as any, {} as any, {} as any, {} as any);
  const freeTreatment = {
    unitPrice: 0, listPrice: 0, quantity: 1, priceReason: null as string | null,
    service: { isFree: true },
  };
  const encounter = (id: string, treatments = [freeTreatment], invoices: any[] = []) => ({
    id, closedAt: null, patient: { id: 'patient', code: 'P1', fullName: 'Patient' },
    dentist: { id: 'dentist', fullName: 'Dentist' }, treatments, invoices,
  });

  beforeEach(() => { jest.clearAllMocks(); });

  it('returns complete counts without fetching patient rows for the summary', async () => {
    count.mockResolvedValueOnce(161).mockResolvedValueOnce(160);
    const result = await service.listEncountersMissingInvoice(1, 50, true);
    expect(result).toEqual({ data: [], pagination: {
      page: 1, pageSize: 50, total: 161, actionable: 1, explicitlyFree: 160,
      scope: 'all', scopeTotal: 161, hasPrevious: false, hasMore: true,
    } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('filters actionable records in the database before pagination', async () => {
    count.mockResolvedValueOnce(161).mockResolvedValueOnce(160);
    findMany.mockResolvedValue([encounter('manual', [{ ...freeTreatment, unitPrice: 100, listPrice: 100, priceReason: 'manual override' }])]);
    const result = await service.listEncountersMissingInvoice(1, 50, false, 'actionable');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].explicitlyFree).toBe(false);
    expect(result.pagination.scopeTotal).toBe(1);
    const query = findMany.mock.calls[0][0];
    expect(query.skip).toBe(0);
    expect(query.take).toBe(50);
    expect(query.where.AND[1]).toHaveProperty('NOT');
    expect(query.where.AND[1].NOT.invoices).toEqual({ none: {} });
  });

  it('uses null and empty reasons consistently and keeps voided/manual rows actionable', async () => {
    count.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    findMany.mockResolvedValue([
      encounter('void', [freeTreatment], [{ id: 'void-id', code: 'V1', voidReason: 'Fix' }]),
      encounter('manual', [{ ...freeTreatment, priceReason: 'override' }]),
      encounter('override-reason', [{ ...freeTreatment, unitPrice: 100, listPrice: 100, priceReason: 'manual override' }]),
      encounter('free', [freeTreatment]),
    ]);
    const result = await service.listEncountersMissingInvoice(1, 50, false, 'all');
    expect(result.data.map(row => row.explicitlyFree)).toEqual([false, false, false, true]);
    expect(result.pagination).toMatchObject({ total: 5, actionable: 4, explicitlyFree: 1, scopeTotal: 5 });
    const countWhere = count.mock.calls[1][0].where.AND[1];
    expect(countWhere.invoices).toEqual({ none: {} });
    expect(countWhere.treatments.every.OR[1].priceReason).toBeNull();
  });
});
