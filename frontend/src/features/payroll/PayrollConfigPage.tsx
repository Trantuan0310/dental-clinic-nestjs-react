import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  overtimeMultiplier: z.coerce.number().min(1, 'Tối thiểu 1.0'),
  defaultTaxTncnPctPercent: z.coerce.number().min(0).max(100),
  bhxhPctPercent: z.coerce.number().min(0).max(100),
  bhytPctPercent: z.coerce.number().min(0).max(100),
  bhtnPctPercent: z.coerce.number().min(0).max(100),
  minGrossForBhxh: z.coerce.number().min(0),
  probationSalaryPctPercent: z.coerce.number().min(0).max(100),
});

type FormValues = z.infer<typeof schema>;

export default function PayrollConfigPage() {
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
      notify.success('Đã lưu cấu hình payroll');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể lưu cấu hình'));
    }
  });

  if (isLoading) return <PageLoader />;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Cấu hình Payroll</h1>
        <p className="mt-1 text-sm text-gray-500">
          Thiết lập các thông số tính lương cho phòng khám
        </p>
      </div>

      {!config && (
        <Alert variant="warning">Không tải được cấu hình hiện tại — hệ thống sẽ dùng giá trị mặc định khi lưu.</Alert>
      )}

      <Card title="Chu kỳ lương">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Chu kỳ"
            {...register('payrollCycle')}
            error={errors.payrollCycle?.message}
            options={[
              { value: 'MONTHLY', label: 'Hàng tháng' },
              { value: 'BIWEEKLY', label: 'Hàng 2 tuần' },
              { value: 'WEEKLY', label: 'Hàng tuần' },
            ]}
          />
        </div>
      </Card>

      <Card title="Làm thêm giờ & thử việc">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Hệ số làm thêm"
            type="number"
            step="0.1"
            {...register('overtimeMultiplier')}
            error={errors.overtimeMultiplier?.message}
            hint="VD: 1.5 = 150% lương cơ bản"
          />
          <Input
            label="% Lương thử việc"
            type="number"
            step="0.1"
            {...register('probationSalaryPctPercent')}
            error={errors.probationSalaryPctPercent?.message}
            hint="VD: 85 = 85% lương chính thức"
          />
        </div>
      </Card>

      <Card title="Thuế và BHXH">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Thuế TNCN mặc định"
            type="number"
            step="0.1"
            {...register('defaultTaxTncnPctPercent')}
            error={errors.defaultTaxTncnPctPercent?.message}
            hint="% (VD: 10 = 10%)"
          />
          <Input
            label="BHXH"
            type="number"
            step="0.1"
            {...register('bhxhPctPercent')}
            error={errors.bhxhPctPercent?.message}
            hint="%"
          />
          <Input
            label="BHYT"
            type="number"
            step="0.1"
            {...register('bhytPctPercent')}
            error={errors.bhytPctPercent?.message}
            hint="%"
          />
          <Input
            label="BHTN"
            type="number"
            step="0.1"
            {...register('bhtnPctPercent')}
            error={errors.bhtnPctPercent?.message}
            hint="%"
          />
          <Input
            label="Lương tối thiểu đóng BHXH"
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
          Lưu cấu hình
        </Button>
      </div>
    </form>
  );
}
