import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { StockAdjustmentDto, StockInDto, StockOutDto } from './inventory.dto';

const errorsOf = (cls: any, body: object) =>
  validateSync(plainToInstance(cls, body)).flatMap(e =>
    Object.keys(e.constraints ?? {}).map(k => `${e.property}.${k}`),
  );

describe('reasons on stock movements (BR-INV-006, BR-INV-008)', () => {
  it('a manual stock-out and an adjustment need a reason of at least 3 characters', () => {
    expect(errorsOf(StockOutDto, { quantity: 1 })).toContain('reason.minLength');
    expect(errorsOf(StockOutDto, { quantity: 1, reason: '  a ' })).toContain('reason.minLength');
    expect(errorsOf(StockAdjustmentDto, { newQuantity: 5 })).toContain('reason.minLength');
    expect(errorsOf(StockOutDto, { quantity: 1, reason: 'Hỏng do ẩm' })).toEqual([]);
    expect(errorsOf(StockAdjustmentDto, { newQuantity: 5, reason: 'Kiểm kê cuối tháng' })).toEqual(
      [],
    );
  });

  it('a stock-in still does not', () => {
    expect(errorsOf(StockInDto, { quantity: 10 })).toEqual([]);
  });
});
