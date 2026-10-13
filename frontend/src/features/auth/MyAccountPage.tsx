import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { KeyRound } from 'lucide-react';
import { Alert, Button, Card, Input } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { getRoleLabel } from '@/lib/nav';
import { authApi } from './authApi';
import { useTranslation } from 'react-i18next';

// Mirrors AuthService.validatePasswordStrength so most mistakes show before submit.
function passwordProblem(password: string, email: string): string | null {
  if (password.length < 8) return 'uiEntry.account.passwordLength';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'uiEntry.account.passwordLettersNumbers';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && password.toLowerCase().includes(local)) return 'uiEntry.account.passwordEmail';
  return null;
}

/** "Tài khoản của tôi": who is signed in, and changing the password. */
export default function MyAccountPage() {
  const { t } = useTranslation();
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
    if (problem) return setError(t(problem));
    if (next !== confirm) return setError(t('uiEntry.account.passwordMismatch'));
    if (next === current) return setError(t('uiEntry.account.passwordMustDiffer'));
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      notify.success(t('uiEntry.account.passwordChanged'));
      navigate('/login', { replace: true });
    } catch (err) {
      setError(
        isAxiosError(err) && err.response?.status === 401
          ? t('uiEntry.account.incorrectCurrentPassword')
          : getApiErrorMessage(err, t('uiEntry.account.changeFailed')),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('uiEntry.account.title')} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('uiEntry.account.signInInfo')}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.account.fullName')}</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-surface-100">{user.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.account.email')}</dt>
              <dd className="mt-0.5 break-all text-gray-900 dark:text-surface-100">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.account.role')}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <span key={r} className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    {getRoleLabel(r)}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title={t('uiEntry.account.changePassword')} className="lg:col-span-2">
          <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
            <Input
              label={t('uiEntry.account.currentPassword')}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <Input
              label={t('uiEntry.account.newPassword')}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <Input
              label={t('uiEntry.account.confirmPassword')}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiEntry.account.passwordRules')}</p>
            {error && <Alert type="danger">{error}</Alert>}
            <Button type="submit" isLoading={busy} disabled={!current || !next || !confirm}>
              <KeyRound className="h-4 w-4" /> {t('uiEntry.account.changePassword')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
