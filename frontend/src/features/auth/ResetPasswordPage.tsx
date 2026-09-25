import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '@/features/auth/authApi';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/brand';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z
    .object({
      newPassword: z.string().min(8, t('auth.resetPassword.errors.minLength')),
      confirmPassword: z.string().min(1, t('auth.resetPassword.errors.required')),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: t('auth.resetPassword.errors.mismatch'),
      path: ['confirmPassword'],
    });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setSubmitError(null);
    try {
      await authApi.resetPassword(token, values.newPassword);
      notify.success(t('auth.resetPassword.success'));
      navigate('/login', { replace: true });
    } catch (err) {
      setSubmitError(getApiErrorMessage(err));
    }
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12 dark:bg-surface-950">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>

      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo variant="full" size="lg" theme="light" />
      </div>

      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-surface-50">
          {t('auth.resetPassword.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
          {t('auth.resetPassword.subtitle')}
        </p>

        {!token ? (
          <div className="mt-6 space-y-4">
            <Alert variant="error" announce>
              {t('auth.resetPassword.missingToken')}
            </Alert>
            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('auth.resetPassword.backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate aria-label={t('auth.resetPassword.title')}>
            <Input
              label={t('auth.resetPassword.newPassword')}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('newPassword')}
              error={errors.newPassword?.message}
              required
            />
            <Input
              label={t('auth.resetPassword.confirmPassword')}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('confirmPassword')}
              error={errors.confirmPassword?.message}
              required
            />
            {submitError && (
              <Alert variant="error" announce>
                {submitError}
              </Alert>
            )}
            <Button type="submit" isLoading={isSubmitting} fullWidth size="lg">
              {t('auth.resetPassword.submit')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
