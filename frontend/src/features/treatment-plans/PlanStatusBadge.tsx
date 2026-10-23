import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';
import type { TreatmentPlanStatus } from './treatmentPlansApi';

const STATUS_VARIANT: Record<TreatmentPlanStatus, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'default',
  PROPOSED: 'info',
  ACCEPTED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function PlanStatusBadge({ status }: { status: TreatmentPlanStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`uiPlans.status.${status}`)}</Badge>;
}
