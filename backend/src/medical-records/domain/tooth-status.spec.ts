import { invalidToothEntries } from './tooth-numbers';

describe('invalidToothEntries (BR-MR-008)', () => {
  it('accepts the chart states with or without notes', () => {
    expect(
      invalidToothEntries({
        '16': { status: 'filled', notes: 'Hàn 2023' },
        '26': { status: 'healthy' },
        '36': { status: 'extraction_needed', notes: null },
      }),
    ).toEqual([]);
  });

  it('names teeth with an unknown state, a non-object entry or an over-long note', () => {
    expect(
      invalidToothEntries({
        '11': { status: 'broken' },
        '12': 'Filling',
        '13': { status: 'filled', notes: 'x'.repeat(1001) },
        '14': { notes: 'no status' },
        '15': { status: 'crowned' },
      }),
    ).toEqual(['11', '12', '13', '14']);
  });
});
