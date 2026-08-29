import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, SearchInput, Spinner } from '@/components/ui';
import { useAuditLogs } from './adminApi';
import type { AuditLog } from '@/types/admin';

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  'invoice.issued': 'Phát hành hóa đơn',
  'invoice.void': 'Hủy hóa đơn',
  'payment.created': 'Tạo thanh toán',
  'payment.reversed': 'Hoàn tiền',
  'user.created': 'Tạo người dùng',
  'user.updated': 'Cập nhật người dùng',
  'user.deactivated': 'Vô hiệu hóa người dùng',
  'user.password_reset': 'Đặt lại mật khẩu',
  'encounter.created': 'Tạo hồ sơ khám',
  'encounter.closed': 'Đóng hồ sơ khám',
  'inventory.adjusted': 'Điều chỉnh tồn kho',
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  USR: 'Người dùng',
  APT: 'Lịch hẹn',
  PTN: 'Bệnh nhân',
  ENC: 'Hồ sơ khám',
  INV: 'Hóa đơn',
  PAY: 'Thanh toán',
  ITM: 'Vật tư',
  ROL: 'Vai trò',
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedLogs, setAccumulatedLogs] = useState<AuditLog[]>([]);

  const { data, isLoading, isFetching } = useAuditLogs({
    limit: PAGE_SIZE,
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entityFilter ? { targetType: entityFilter } : {}),
    ...(dateFrom ? { from: dateFrom } : {}),
    ...(dateTo ? { to: dateTo } : {}),
    cursor,
  });

  // Backend pagination is cursor-based (no total page count), so "load more"
  // appends onto what's already shown rather than a numbered page picker.
  // Reset the accumulator whenever a non-cursor filter changes (fresh query).
  useEffect(() => {
    setCursor(undefined);
    setAccumulatedLogs([]);
  }, [actionFilter, entityFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!data) return;
    setAccumulatedLogs((prev) => (cursor ? [...prev, ...data.data] : data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const logs = accumulatedLogs;
  const pagination = data?.pagination;

  const handleLoadMore = () => {
    if (pagination?.nextCursor) setCursor(pagination.nextCursor);
  };

  const handleExportCsv = () => {
    const header = ['Thời gian', 'Hành động', 'Người thực hiện', 'Đối tượng', 'ID đối tượng', 'IP'];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filteredLogs.map((log) =>
      [
        new Date(log.occurredAt).toLocaleString('vi-VN'),
        ACTION_LABELS[log.action] ?? log.action,
        log.actorEmailAtTime ?? 'Hệ thống',
        TARGET_TYPE_LABELS[log.targetType ?? ''] ?? log.targetType ?? '',
        log.targetId ?? '',
        log.ipAddress ?? '',
      ]
        .map(escape)
        .join(','),
    );
    const csv = [header.map(escape).join(','), ...rows].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = search
    ? logs.filter((log) => {
        const q = search.toLowerCase();
        return (
          (log.actorEmailAtTime?.toLowerCase() ?? '').includes(q) ||
          (log.action.toLowerCase()).includes(q) ||
          (log.targetType?.toLowerCase() ?? '').includes(q) ||
          (log.targetId?.toLowerCase() ?? '').includes(q)
        );
      })
    : logs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Nhật ký kiểm toán</h1>
          <p className="mt-1 text-sm text-gray-500">
            Theo dõi mọi hoạt động trong hệ thống
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCsv} disabled={filteredLogs.length === 0}>
          <Download className="h-4 w-4" />
          Xuất CSV
        </Button>
      </div>

      <Card noPadding>
        <div className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder="Tìm kiếm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">Tất cả hành động</option>
              <option value="invoice.issued">Phát hành hóa đơn</option>
              <option value="payment.created">Tạo thanh toán</option>
              <option value="user.created">Tạo người dùng</option>
              <option value="user.deactivated">Vô hiệu hóa</option>
              <option value="encounter.closed">Đóng hồ sơ khám</option>
            </select>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <option value="">Tất cả đối tượng</option>
              <option value="USR">Người dùng</option>
              <option value="APT">Lịch hẹn</option>
              <option value="ENC">Hồ sơ khám</option>
              <option value="INV">Hóa đơn</option>
              <option value="PAY">Thanh toán</option>
              <option value="ITM">Vật tư</option>
            </select>
            <input
              type="date"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="self-center text-gray-400">—</span>
            <input
              type="date"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-medium text-gray-600">Thời gian</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Hành động</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Người thực hiện</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Đối tượng</th>
                  <th className="px-4 py-3 font-medium text-gray-600">IP</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(log.occurredAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {log.actorEmailAtTime ?? 'Hệ thống'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-mono text-brand-700">
                        {TARGET_TYPE_LABELS[log.targetType ?? ''] ?? log.targetType ?? '—'}
                      </span>
                      {log.targetId && (
                        <span className="ml-1 text-xs text-gray-500">{log.targetId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredLogs.length === 0 && !isLoading && (
          <div className="p-6 text-center text-gray-500">Không có nhật ký nào</div>
        )}

        {pagination?.hasMore && (
          <div className="flex justify-center border-t border-gray-100 px-4 py-3">
            <Button variant="outline" size="sm" onClick={handleLoadMore} isLoading={isFetching}>
              Tải thêm
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
