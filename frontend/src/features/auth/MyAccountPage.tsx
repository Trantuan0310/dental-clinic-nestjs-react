import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { KeyRound } from 'lucide-react';
import { Alert, Button, Card, Input } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { NAV_ROLE_HINT } from '@/lib/nav';
import { authApi } from './authApi';

// Mirrors AuthService.validatePasswordStrength so most mistakes show before submit.
function passwordProblem(password: string, email: string): string | null {
  if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Mật khẩu phải có cả chữ và số';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && password.toLowerCase().includes(local)) return 'Mật khẩu không được chứa tên email của bạn';
  return null;
}

/** "Tài khoản của tôi": who is signed in, and changing the password. */
export default function MyAccountPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(next, user.email);
    if (problem) return setError(problem);
    if (next !== confirm) return setError('Mật khẩu nhập lại không khớp');
    if (next === current) return setError('Mật khẩu mới phải khác mật khẩu hiện tại');
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      notify.success('Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(
        isAxiosError(err) && err.response?.status === 401
          ? 'Mật khẩu hiện tại không đúng'
          : getApiErrorMessage(err, 'Không đổi được mật khẩu. Vui lòng thử lại.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Tài khoản của tôi" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Thông tin đăng nhập">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Họ tên</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-surface-100">{user.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Email đăng nhập</dt>
              <dd className="mt-0.5 break-all text-gray-900 dark:text-surface-100">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Vai trò</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <span key={r} className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {NAV_ROLE_HINT[r] ?? r}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Đổi mật khẩu" className="lg:col-span-2">
          <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
            <Input
              label="Mật khẩu hiện tại"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <Input
              label="Mật khẩu mới"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <Input
              label="Nhập lại mật khẩu mới"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">
              Ít nhất 8 ký tự, có cả chữ và số, không chứa tên email. Sau khi đổi, mọi thiết bị đang đăng
              nhập sẽ bị đăng xuất.
            </p>
            {error && <Alert type="danger">{error}</Alert>}
            <Button type="submit" isLoading={busy} disabled={!current || !next || !confirm}>
              <KeyRound className="h-4 w-4" /> Đổi mật khẩu
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
