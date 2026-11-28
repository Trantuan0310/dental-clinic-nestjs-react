import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { exportCsv, type CsvColumn } from '@/lib/csv';
import { Button, Card } from '@/components/ui';

interface Row {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stock: number;
  daily30: number;
  daily90: number;
  daysLeft: number;
  suggested: number;
}
export function ReorderReport() {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiOperations.reorder.${key}`);
  const columns: CsvColumn<Row>[] = [
    { header: k('sku'), accessor: r => r.sku },
    { header: k('name'), accessor: r => r.name },
    { header: k('unit'), accessor: r => r.unit },
    { header: k('stock'), accessor: r => r.stock },
    { header: k('daily30'), accessor: r => r.daily30 },
    { header: k('daily90'), accessor: r => r.daily90 },
    { header: k('daysLeft'), accessor: r => r.daysLeft },
    { header: k('suggested'), accessor: r => r.suggested },
  ];
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('14');
  const leadDays = Number(days);
  const valid = Number.isInteger(leadDays) && leadDays >= 1 && leadDays <= 365;
  const report = useQuery({
    queryKey: ['inventory', 'reorder', leadDays],
    enabled: open && valid,
    queryFn: async () =>
      (await api.get<{ data: Row[] }>('/inventory/reorder', { params: { leadDays } })).data.data,
  });
  return (
    <Card>
      <details onToggle={e => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">{k('title')}</summary>
        <div className="mt-3 space-y-3">
          <label>
            {k('leadDays')}{' '}
            <input
              className="w-20 rounded border px-2"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={e => setDays(e.target.value)}
            />
          </label>
          <p className="text-sm">
            {k('formula')}
          </p>
          {!valid ? (
            <p role="alert">{k('invalidDays')}</p>
          ) : report.isError ? (
            <p role="alert">{k('loadError')}</p>
          ) : !report.data ? (
            <p>{k('loading')}</p>
          ) : !report.data.length ? (
            <p>{k('empty')}</p>
          ) : (
            <>
              <Button
                onClick={() => exportCsv('nen-nhap-' + leadDays + '-ngay', report.data, columns)}
              >
                {k('exportCsv')}
              </Button>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {columns.map(c => (
                        <th key={c.header} className="p-2">
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.map(r => (
                      <tr key={r.id}>
                        {columns.map(c => {
                          const value = c.accessor(r);
                          return (
                            <td key={c.header} className="p-2">
                              {typeof value === 'number'
                                ? value.toLocaleString('vi-VN', { maximumFractionDigits: 4 })
                                : String(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </details>
    </Card>
  );
}
