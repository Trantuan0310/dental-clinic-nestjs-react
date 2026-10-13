import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ArrowRight } from 'lucide-react';
import { Button, Card, StatusBadge, EmptyState, PageLoader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { usePatientEncounters } from './medicalRecordsApi';

export default function PatientEncountersPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: encounters, isLoading } = usePatientEncounters(patientId);

  // GET /patients/:id/encounters accepts encounter.read.any/.own/.basic and
  // returns a lighter "basic" shape for .basic-only callers (receptionist).
  // The single-encounter detail page (/encounters/:id) only accepts
  // .any/.own — so a receptionist can see this summary list but must not be
  // offered a drill-down link into the full clinical detail they can't load.
  const canViewDetail = useAuthStore((s) =>
    s.hasAnyPermission(['encounter.read.any', 'encounter.read.own']),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiClinical.encounterHistory')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.patientCode')}: {patientId}</p>
        </div>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-6">
            <PageLoader />
          </div>
        ) : !encounters || encounters.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10 text-gray-400" />}
            title={t('uiClinical.encounterHistoryEmpty')}
            description={t('uiClinical.patientNotSeen')}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {encounters.map((encounter) => (
              <div
                key={encounter.id}
                className={`flex items-center justify-between p-4 ${
                  canViewDetail ? 'cursor-pointer hover:bg-gray-50' : ''
                }`}
                onClick={canViewDetail ? () => navigate(`/encounters/${encounter.id}`) : undefined}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {formatDate(encounter.startedAt)}
                      </p>
                      <StatusBadge status={encounter.status} />
                    </div>
                    <p className="text-sm text-gray-500">{encounter.dentistName}</p>
                    {encounter.chiefComplaint && (
                      <p className="mt-1 text-sm text-gray-600 truncate max-w-md">
                        {encounter.chiefComplaint}
                      </p>
                    )}
                  </div>
                </div>
                {canViewDetail && (
                  <Button variant="ghost" size="sm">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
