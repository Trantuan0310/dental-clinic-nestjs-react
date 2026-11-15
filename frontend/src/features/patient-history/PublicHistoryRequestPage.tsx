import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api, unwrap } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import { PublicTopBar } from '@/features/booking/PublicTopBar';

/**
 * The patient asks for their visit history with their phone number. The link
 * goes to the email / phone on file, never to this screen, so knowing a
 * number is not enough to read someone's record.
 */
export default function PublicHistoryRequestPage() {
  const [phone, setPhone] = useState('');
  const request = useMutation({
    mutationFn: async () =>
      unwrap((await api.post('/public/patient-history/request', { phone })).data) as { message: string },
  });
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-surface-950">
      <div className="mx-auto max-w-xl">
        <PublicTopBar />
        <Card className="p-5 sm:p-7">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-surface-100">
            <History className="h-5 w-5 text-brand-600" aria-hidden /> Tra cứu lịch sử khám
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-surface-300">
            Nhập số điện thoại bạn đã đăng ký tại phòng khám. Chúng tôi sẽ gửi đường dẫn xem lịch sử khám, điều trị và
            hóa đơn tới email hoặc số điện thoại trong hồ sơ của bạn. Đường dẫn có hiệu lực 7 ngày.
          </p>
          {request.isSuccess ? (
            <div role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {request.data.message}
            </div>
          ) : (
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                request.mutate();
              }}
            >
              <Input
                label="Số điện thoại"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0901 234 567"
                required
              />
              {request.isError && (
                <p role="alert" className="text-sm text-red-600">
                  Không gửi được yêu cầu (có thể bạn đã thử quá nhiều lần). Vui lòng thử lại sau ít phút.
                </p>
              )}
              <Button type="submit" isLoading={request.isPending} disabled={phone.replace(/\D/g, '').length < 9}>
                Gửi đường dẫn cho tôi
              </Button>
            </form>
          )}
          <p className="mt-6 text-xs text-gray-500 dark:text-surface-400">
            Chưa có hồ sơ? <Link to="/booking" className="text-brand-700 hover:underline dark:text-brand-300">Đặt lịch khám</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
