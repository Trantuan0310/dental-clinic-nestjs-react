import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '@/features/auth/authApi';
import { getApiErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/brand';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.forgotPassword.errors.required'))
      .email(t('auth.forgotPassword.errors.required')),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSent(true);
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
          {t('auth.forgotPassword.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
          {t('auth.forgotPassword.subtitle')}
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <Alert variant="success" announce>
              {t('auth.forgotPassword.success')}
            </Alert>
            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate aria-label={t('auth.forgotPassword.title')}>
            <Input
              label={t('auth.forgotPassword.email')}
              type="email"
              autoComplete="email"
              placeholder="you@clinic.local"
              {...register('email')}
              error={errors.email?.message}
              required
            />
            {submitError && (
              <Alert variant="error" announce>
                {submitError}
              </Alert>
            )}
            <Button type="submit" isLoading={isSubmitting} fullWidth size="lg">
              {t('auth.forgotPassword.submit')}
            </Button>
            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-surface-400"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
