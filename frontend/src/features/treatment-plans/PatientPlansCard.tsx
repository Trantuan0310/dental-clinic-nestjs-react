import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Plus } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { formatCurrency, formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { usePatientPlans } from './treatmentPlansApi';
import { PlanStatusBadge } from './PlanStatusBadge';

/** The patient's treatment plans, newest first, on the patient page. */
export function PatientPlansCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: plans = [], isLoading, error } = usePatientPlans(patientId);

  return (
    <Card
      title={t('uiPlans.plans')}
      actions={
        <PermissionGuard permission="treatment_plan.write">
          <Button variant="outline" size="sm" onClick={() => navigate(`/treatment-plans/new?patientId=${patientId}`)}>
            <Plus className="h-4 w-4" />
            {t('uiPlans.newPlan')}
          </Button>
        </PermissionGuard>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{getApiErrorMessage(error, t('uiPlans.loadError'))}</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiPlans.noPlans')}</p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              data-testid="patient-plan"
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50 dark:border-surface-700 dark:hover:bg-surface-800"
              onClick={() => navigate(`/treatment-plans/${plan.id}`)}
            >
              <ClipboardList className="h-5 w-5 shrink-0 text-gray-400 dark:text-surface-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-surface-100">{plan.title}</span>
                  <PlanStatusBadge status={plan.status} />
                </div>
                <p className="text-sm text-gray-500 dark:text-surface-400">
                  {formatDate(plan.createdAt)} • {plan.dentist.fullName} •{' '}
                  {formatCurrency(plan.totals.quoted - plan.totals.skipped)} •{' '}
                  {t('uiPlans.progress', { done: plan.totals.itemsDone, total: plan.totals.itemsTotal })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
