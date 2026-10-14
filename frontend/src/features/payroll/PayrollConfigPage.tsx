import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Card, Button, Input, Select, Alert } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { usePayrollConfig, useUpdatePayrollConfig } from './payrollApi';

// Percent-style fields are stored as 0–1 fractions in the DB (e.g. 0.08 =
// 8%) but shown/edited here as whole percent numbers for admin usability.
const schema = z.object({
  payrollCycle: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  overtimeMultiplier: z.coerce.number().min(1, 'uiWorkforce.payrollMinMultiplierError'),
  defaultTaxTncnPctPercent: z.coerce.number().min(0).max(100),
  bhxhPctPercent: z.coerce.number().min(0).max(100),
  bhytPctPercent: z.coerce.number().min(0).max(100),
  bhtnPctPercent: z.coerce.number().min(0).max(100),
  minGrossForBhxh: z.coerce.number().min(0),
  probationSalaryPctPercent: z.coerce.number().min(0).max(100),
});

type FormValues = z.infer<typeof schema>;

export default function PayrollConfigPage() {
  const { t } = useTranslation();
  const { data: config, isLoading } = usePayrollConfig();
  const updateConfig = useUpdatePayrollConfig();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: config
      ? {
          payrollCycle: config.payrollCycle,
          overtimeMultiplier: config.overtimeMultiplier,
          defaultTaxTncnPctPercent: config.defaultTaxTncnPct * 100,
          bhxhPctPercent: config.bhxhPct * 100,
          bhytPctPercent: config.bhytPct * 100,
          bhtnPctPercent: config.bhtnPct * 100,
          minGrossForBhxh: config.minGrossForBhxh,
          probationSalaryPctPercent: config.probationSalaryPct * 100,
        }
      : undefined,
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateConfig.mutateAsync({
        payrollCycle: values.payrollCycle,
        overtimeMultiplier: values.overtimeMultiplier,
        defaultTaxTncnPct: values.defaultTaxTncnPctPercent / 100,
        bhxhPct: values.bhxhPctPercent / 100,
        bhytPct: values.bhytPctPercent / 100,
        bhtnPct: values.bhtnPctPercent / 100,
        minGrossForBhxh: values.minGrossForBhxh,
        probationSalaryPct: values.probationSalaryPctPercent / 100,
      });
      notify.success(t('uiWorkforce.payrollConfigSaved'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollConfigSaveError')));
    }
  });

  if (isLoading) return <PageLoader />;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollConfigTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('uiWorkforce.payrollConfigDescription')}
        </p>
      </div>

      {!config && (
        <Alert variant="warning">{t('uiWorkforce.payrollConfigLoadFallback')}</Alert>
      )}

      <Card title={t('uiWorkforce.payrollCycle')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('uiWorkforce.payrollCycle')}
            {...register('payrollCycle')}
            error={errors.payrollCycle?.message}
            options={[
              { value: 'MONTHLY', label: t('uiWorkforce.monthly') },
              { value: 'BIWEEKLY', label: t('uiWorkforce.biweekly') },
              { value: 'WEEKLY', label: t('uiWorkforce.weekly') },
            ]}
          />
        </div>
      </Card>

      <Card title={t('uiWorkforce.payrollOvertimeAndProbation')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('uiWorkforce.payrollOvertimeMultiplier')}
            type="number"
            step="0.1"
            {...register('overtimeMultiplier')}
            error={errors.overtimeMultiplier?.message ? t(errors.overtimeMultiplier.message) : undefined}
            hint={t('uiWorkforce.payrollOvertimeExample')}
          />
          <Input
            label={t('uiWorkforce.payrollProbationPercentage')}
            type="number"
            step="0.1"
            {...register('probationSalaryPctPercent')}
            error={errors.probationSalaryPctPercent?.message}
            hint={t('uiWorkforce.payrollProbationExample')}
          />
        </div>
      </Card>

      <Card title={t('uiWorkforce.payrollTaxAndInsurance')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label={t('uiWorkforce.payrollIncomeTaxDefault')}
            type="number"
            step="0.1"
            {...register('defaultTaxTncnPctPercent')}
            error={errors.defaultTaxTncnPctPercent?.message}
            hint={t('uiWorkforce.payrollPercentExample')}
          />
          <Input
            label={t('uiWorkforce.payrollSocialInsurance')}
            type="number"
            step="0.1"
            {...register('bhxhPctPercent')}
            error={errors.bhxhPctPercent?.message}
            hint="%"
          />
          <Input
            label={t('uiWorkforce.payrollHealthInsurance')}
            type="number"
            step="0.1"
            {...register('bhytPctPercent')}
            error={errors.bhytPctPercent?.message}
            hint="%"
          />
          <Input
            label={t('uiWorkforce.payrollUnemploymentInsurance')}
            type="number"
            step="0.1"
            {...register('bhtnPctPercent')}
            error={errors.bhtnPctPercent?.message}
            hint="%"
          />
          <Input
            label={t('uiWorkforce.payrollMinimumInsuranceSalary')}
            type="number"
            {...register('minGrossForBhxh')}
            error={errors.minGrossForBhxh?.message}
            hint="VND"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting || updateConfig.isPending}>
          <Save className="h-4 w-4" />
          {t('uiWorkforce.payrollSaveConfig')}
        </Button>
      </div>
    </form>
  );
}
