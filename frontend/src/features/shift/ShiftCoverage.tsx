import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { clinicToday } from '@/lib/clinicTime';

interface Cell {
  weekday: number;
  hour: number;
  availableMin: number;
  bookedMin: number;
  demandMin: number;
}
interface Coverage {
  dentists: { id: string; fullName: string }[];
  cells: Cell[];
}
const order = [1, 2, 3, 4, 5, 6, 0];

export function ShiftCoverage() {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiWorkforce.coverage.${key}`);
  const weekdays = k('weekdays').split(',');
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(clinicToday);
  const [dentistId, setDentistId] = useState('');
  const end = new Date(from + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 6);
  const to = Number.isFinite(+end) ? end.toISOString().slice(0, 10) : '';
  const query = useQuery({
    queryKey: ['shifts', 'coverage', from, dentistId],
    enabled: open && !!to,
    queryFn: async () =>
      (
        await api.get<{ data: Coverage }>('/billing/reports/shift-coverage', {
          params: { from, to, dentistId: dentistId || undefined },
        })
      ).data.data,
  });
  const cells = query.data?.cells ?? [];
  const bySlot = new Map(cells.map(c => [c.weekday + '-' + c.hour, c]));
  const hours = Array.from(new Set(cells.map(c => c.hour))).sort((a, b) => a - b);
  const scale = Math.max(1, ...cells.map(c => Math.max(c.availableMin, c.demandMin)));
  return (
    <Card>
      <details onToggle={e => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">{k('title')}</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-4">
            <label>
              {k('from')} <input className="input-base mt-1 h-9 w-auto" type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </label>
            <label>
              {k('dentist')}{' '}
              <select className="input-base mt-1 h-9 w-auto" value={dentistId} onChange={e => setDentistId(e.target.value)}>
                <option value="">{k('allDentists')}</option>
                {query.data?.dentists.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-sm">
            {k('note')}
          </p>
          {!to ? (
            <p>{k('pickStart')}</p>
          ) : query.isError ? (
            <p role="alert">{k('loadError')}</p>
          ) : !query.data ? (
            <p>{k('loading')}</p>
          ) : !hours.length ? (
            <p>{k('empty')}</p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {(['availableMin', 'demandMin'] as const).map(metric => (
                <div key={metric} className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-1 text-center text-sm">
                    <caption className="font-semibold">
                      {metric === 'availableMin'
                        ? k('available')
                        : k('demand')}
                    </caption>
                    <thead>
                      <tr>
                        <th>{k('hour')}</th>
                        {order.map(d => (
                          <th key={d}>{weekdays[d]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hours.map(h => (
                        <tr key={h}>
                          <th>{h}h</th>
                          {order.map(d => {
                            const cell = bySlot.get(d + '-' + h);
                            if (!cell) return <td key={d}>—</td>;
                            const value = cell[metric];
                            const gap =
                              metric === 'availableMin'
                                ? cell.availableMin - cell.bookedMin
                                : cell.demandMin - cell.bookedMin;
                            return (
                              <td
                                key={d}
                                className="keep-light rounded p-1 text-slate-900"
                                style={{
                                  backgroundColor: `hsl(174 45% ${97 - (32 * value) / scale}%)`,
                                }}
                              >
                                {Math.round(value)}
                                {gap > 0 && (
                                  <small
                                    className={
                                      metric === 'demandMin'
                                        ? 'block font-bold text-red-800'
                                        : 'block text-slate-700'
                                    }
                                  >
                                    {metric === 'demandMin' ? k('short') : k('spare')} {Math.round(gap)}′
                                  </small>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}
