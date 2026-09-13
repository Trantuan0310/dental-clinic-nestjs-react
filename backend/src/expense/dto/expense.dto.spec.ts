import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListExpensesQueryDto } from './expense.dto';

async function errorsFor(plain: Record<string, unknown>) {
  const dto = plainToInstance(ListExpensesQueryDto, plain);
  return validate(dto);
}

describe('ListExpensesQueryDto', () => {
  it('rejects status=all (regression: ExpenseListPage\'s "Tất cả trạng thái" filter used to send the literal string "all", which is not a real ExpenseStatus and 500s in Prisma once passed straight to `where.status`)', async () => {
    const errors = await errorsFor({ status: 'all' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('accepts a real ExpenseStatus value', async () => {
    const errors = await errorsFor({ status: 'APPROVED' });
    expect(errors).toHaveLength(0);
  });

  it('leaves status undefined when omitted (no filter)', async () => {
    const dto = plainToInstance(ListExpensesQueryDto, {});
    expect(dto.status).toBeUndefined();
    expect(await validate(dto)).toHaveLength(0);
  });

  it('coerces string page/pageSize query params to numbers (regression: bare @Query() params had no @Type, so `(page - 1) * pageSize` in the service ran on strings)', async () => {
    const dto = plainToInstance(ListExpensesQueryDto, { page: '2', pageSize: '50' });
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-numeric pageSize instead of letting it reach Prisma', async () => {
    const errors = await errorsFor({ pageSize: 'abc' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('pageSize');
  });

  it('rejects a pageSize above the 200 cap', async () => {
    const errors = await errorsFor({ pageSize: '9999' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('pageSize');
  });

  it('rejects a categoryId that is not a UUID', async () => {
    const errors = await errorsFor({ categoryId: 'not-a-uuid' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('categoryId');
  });
});
