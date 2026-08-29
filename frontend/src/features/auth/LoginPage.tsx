import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { authApi } from '@/features/auth/authApi';
import { useAuthStore } from '@/stores/authStore';
import { getApiErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { notify } from '@/components/ui/Toast';
import { Logo } from '@/components/brand';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.login.errors.required'))
      .email(t('auth.login.errors.required')),
    password: z.string().min(1, t('auth.login.errors.required')),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (isAuthenticated) {
    const to = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={to} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await authApi.login(values.email, values.password);
      notify.success(t('auth.login.submit'));
      const to = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(to, { replace: true });
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, t('auth.login.errors.invalid')));
    }
  });

  const bullets = t('auth.login.hero.bullets', { returnObjects: true }) as string[];

  return (
    <div className="flex min-h-screen flex-col md:flex-row dark:bg-surface-950">
      {/* Left — brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 px-10 py-12 md:flex md:w-1/2 md:flex-col md:justify-center lg:px-16">
        {/* Decorative blobs, matching the soft-circle motif on the logo */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-white/10" aria-hidden="true" />

        <div className="relative">
          <div className="mb-10 inline-flex items-center gap-2.5 rounded-2xl bg-white px-5 py-3 shadow-lg">
            <Logo variant="full" size="sm" />
          </div>

          <h1 className="max-w-md text-3xl font-bold leading-tight text-white lg:text-4xl">
            {t('auth.login.hero.headlinePrefix')}
            <span className="text-brand-100">{t('auth.login.hero.headlineHighlight')}</span>
            {t('auth.login.hero.headlineSuffix')}
          </h1>
          <p className="mt-4 max-w-sm text-sm text-brand-50/90">{t('auth.login.hero.subtitle')}</p>

          <ul className="mt-8 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-white/95">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-100" aria-hidden="true" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right — login form */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-white px-4 py-12 dark:bg-surface-950">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>

        {/* Brand mark shown only on small screens, where the left panel is hidden */}
        <div className="mb-8 flex flex-col items-center gap-3 md:hidden">
          <Logo variant="full" size="lg" theme="light" />
        </div>

        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-surface-50">{t('auth.login.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{t('auth.login.subtitle')}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate aria-label={t('auth.login.title')}>
            <Input
              label={t('auth.login.email')}
              type="email"
              autoComplete="email"
              placeholder="you@clinic.local"
              {...register('email')}
              error={errors.email?.message}
              required
            />
            <Input
              label={t('auth.login.password')}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              error={errors.password?.message}
              required
            />
            {submitError && (
              <Alert variant="error" announce>
                {submitError}
              </Alert>
            )}
            <Button type="submit" isLoading={isSubmitting} fullWidth size="lg">
              {t('auth.login.submit')}
            </Button>
            <p className="text-center text-xs text-gray-500 dark:text-surface-500">
              {t('auth.login.title')}: <span className="font-mono">admin@clinic.local</span> /{' '}
              <span className="font-mono">Admin123!</span>
            </p>
          </form>
        </div>

        <p className="mt-10 text-xs text-gray-400 dark:text-surface-500">© GENSMILE 2026 — Dental Clinic Management System</p>
      </div>
    </div>
  );
}
