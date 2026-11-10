import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
const columns: CsvColumn<Row>[] = [
  { header: 'Mã', accessor: r => r.sku },
  { header: 'Vật tư', accessor: r => r.name },
  { header: 'Đơn vị', accessor: r => r.unit },
  { header: 'Tồn', accessor: r => r.stock },
  { header: 'Dùng/ngày (30 ngày)', accessor: r => r.daily30 },
  { header: 'Dùng/ngày (90 ngày)', accessor: r => r.daily90 },
  { header: 'Số ngày còn dùng', accessor: r => r.daysLeft },
  { header: 'Nên nhập', accessor: r => r.suggested },
];
export function ReorderReport() {
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
        <summary className="cursor-pointer font-semibold">Nên nhập</summary>
        <div className="mt-3 space-y-3">
          <label>
            Số ngày đặt hàng{' '}
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
            Lượng nên nhập = mức dùng bình quân 30 ngày × số ngày đặt hàng − tồn hiện tại. Mức 90
            ngày dùng để đối chiếu.
          </p>
          {!valid ? (
            <p role="alert">Nhập số nguyên từ 1 đến 365 ngày.</p>
          ) : report.isError ? (
            <p role="alert">Không tải được gợi ý nhập kho.</p>
          ) : !report.data ? (
            <p>Đang tải…</p>
          ) : !report.data.length ? (
            <p>Chưa có vật tư cần nhập trong khoảng đã chọn.</p>
          ) : (
            <>
              <Button
                onClick={() => exportCsv('nen-nhap-' + leadDays + '-ngay', report.data, columns)}
              >
                Xuất CSV
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
