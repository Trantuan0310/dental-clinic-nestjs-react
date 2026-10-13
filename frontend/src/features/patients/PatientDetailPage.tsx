import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  AlertTriangle,
  Plus,
  FileText,
  Receipt,
} from 'lucide-react';
import { patientsApi } from '@/features/patients/imperativeApi';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { billingApi } from '@/features/billing/billingApi';
import {
  Button,
  Card,
  StatusBadge,
  InvoiceStatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Alert,
} from '@/components/ui';
import { formatPhone, formatCurrency, formatDate, formatTimeOnly } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useTranslation } from 'react-i18next';

export default function PatientDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [activeTab, setActiveTab] = useState('overview');

  // /encounters/:id (full clinical detail) only accepts encounter.read.any/
  // .own — a receptionist with only encounter.read.basic can see this
  // summary list (via /patients/:id/encounters) but must not be offered a
  // drill-down link into a page their permissions can't actually load.
  const canViewEncounterDetail = useAuthStore((s) =>
    s.hasAnyPermission(['encounter.read.any', 'encounter.read.own']),
  );

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  // Tabs below only need a handful of the patient's own rows — not a link
  // pointing at the unfiltered global list (that was the actual bug: these
  // tabs never fetched anything of their own, they just redirected).
  // Under the ['appointments'] prefix so create/reschedule/cancel refresh it.
  // Newest first comes from the API's default order when no `from` is sent;
  // the client sort only keeps the display order stable.
  const { data: appointmentsData, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['appointments', 'patient-recent', id],
    queryFn: () => appointmentsApi.list({ patientId: id!, pageSize: 5 }),
    enabled: !!id,
  });
  const recentAppointments = [...(appointmentsData?.data ?? [])].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['patient-invoices', id],
    queryFn: () => billingApi.listInvoices({ patientId: id!, pageSize: 5 }),
    enabled: !!id,
  });
  const recentInvoices = invoicesData?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500 dark:text-surface-400">{t('uiClinical.patientNotFound')}</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/patients')}>
          {t('uiClinical.backToPatients')}
        </Button>
      </div>
    );
  }

  const age = patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;

  const hasAllergies = patient.allergies && patient.allergies.length > 0;
  const hasChronicDiseases = patient.chronicDiseases && patient.chronicDiseases.length > 0;

  return (
    <div className="min-w-0 max-w-full space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" aria-label={t('uiClinical.backToPatients')} onClick={() => navigate('/patients')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-2xl font-semibold text-gray-900 dark:text-surface-100">{patient.fullName}</h1>
            <StatusBadge status={patient.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-surface-400">
            {patient.code}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <PermissionGuard permission="patient.update">
            <Button variant="outline" onClick={() => navigate(`/patients/${id}/edit`)}>
              <Edit className="h-4 w-4" />
              {t('uiClinical.edit')}
            </Button>
          </PermissionGuard>
          <PermissionGuard permission="appointment.create">
            <Button onClick={() => navigate(`/appointments?patientId=${id}`)}>
              <Calendar className="h-4 w-4" />
              {t('uiClinical.bookAppointment')}
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Medical Alerts */}
      {(hasAllergies || hasChronicDiseases) && (
        <div className="space-y-2">
          {hasAllergies && (
            <Alert type="danger">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{t('uiClinical.allergies')}:</span>
                {patient.allergies?.join(', ')}
              </div>
            </Alert>
          )}
          {hasChronicDiseases && (
            <Alert type="warning">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{t('uiClinical.chronicConditions')}:</span>
                {patient.chronicDiseases?.join(', ')}
              </div>
            </Alert>
          )}
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {/* Sidebar Info */}
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <span className="text-xl font-semibold">
                  {patient.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="min-w-0 break-words text-base font-medium text-gray-900 dark:text-surface-100">{patient.fullName}</p>
                <p className="text-sm text-gray-500 dark:text-surface-400">
                  {age !== null ? `${t('uiClinical.patientYears', { count: age })} • ` : ''}
                  {patient.gender === 'male' ? t('uiClinical.male') : patient.gender === 'female' ? t('uiClinical.female') : t('uiClinical.other')}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-gray-100 pt-3 dark:border-surface-700">
              {patient.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-gray-400 dark:text-surface-500" />
                  <span>{formatPhone(patient.phone)}</span>
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-gray-400 dark:text-surface-500" />
                  <span>{patient.email}</span>
                </div>
              )}
              {patient.address && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400 dark:text-surface-500" />
                  <span>{patient.address}</span>
                </div>
              )}
              {patient.occupation && (
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-gray-400 dark:text-surface-500" />
                  <span>{patient.occupation}</span>
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-surface-700 dark:text-surface-400">
              <p>
                {t('uiClinical.dateOfBirth')}:{' '}
                {patient.dateOfBirth
                  ? formatDate(patient.dateOfBirth)
                  : '-'}
              </p>
              <p>{t('uiClinical.createdAtLabel')}: {formatDate(patient.createdAt, 'dd/MM/yyyy HH:mm')}</p>
            </div>
          </Card>

          {/* Current Medications */}
          {patient.currentMedications && patient.currentMedications.length > 0 && (
            <Card title={t('uiClinical.currentMedications')}>
              <ul className="space-y-1.5">
                {patient.currentMedications.map((med, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {med}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="min-w-0 lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">{t('uiClinical.overview')}</TabsTrigger>
              <TabsTrigger value="appointments">{t('uiClinical.appointments')}</TabsTrigger>
              <TabsTrigger value="encounters">{t('uiClinical.encounterHistory')}</TabsTrigger>
              <TabsTrigger value="invoices">{t('uiClinical.invoice')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card title={t('uiClinical.statistics')}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-surface-800">
                    <p className="text-xl font-semibold text-gray-900 dark:text-surface-100">
                      {patient.summary?.totalEncounters ?? 0}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.totalVisits')}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-surface-800">
                    <p className="text-xl font-semibold text-gray-900 dark:text-surface-100">
                      {patient.summary?.lastVisitAt
                        ? formatDate(patient.summary.lastVisitAt)
                        : t('uiClinical.none')}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.lastFollowUp')}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-surface-800">
                    <p className="text-xl font-semibold text-gray-900 dark:text-surface-100">
                      {patient.allergies?.length || 0}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.allergies')}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-surface-800">
                    <p className="text-xl font-semibold text-gray-900 dark:text-surface-100">
                      {patient.chronicDiseases?.length || 0}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.chronicConditions')}</p>
                  </div>
                </div>
              </Card>

              {patient.notes && (
                <Card title={t('uiClinical.patientNotes')} className="mt-3">
                  <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-surface-300">{patient.notes}</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="appointments">
              <Card
                title={t('uiClinical.recentAppointments')}
                actions={
                  <PermissionGuard permission="appointment.create">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/appointments?patientId=${id}`)}
                    >
                      <Plus className="h-4 w-4" />
                      {t('uiClinical.bookAppointment')}
                    </Button>
                  </PermissionGuard>
                }
              >
                {appointmentsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800" />
                    ))}
                  </div>
                ) : recentAppointments.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.noAppointments')}</p>
                ) : (
                  <div className="space-y-2">
                    {recentAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50 dark:border-surface-700 dark:hover:bg-surface-800"
                        onClick={() => navigate(`/appointments/list?open=${apt.id}`)}
                      >
                        <Calendar className="h-5 w-5 shrink-0 text-gray-400 dark:text-surface-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-surface-100">
                              {formatDate(apt.startsAt)} •{' '}
                              {formatTimeOnly(apt.startsAt)}
                            </span>
                            <StatusBadge status={apt.status} />
                          </div>
                          <p className="text-sm text-gray-500 dark:text-surface-400">{apt.dentistName}</p>
                          {apt.reason && (
                            <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-surface-300">{apt.reason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Plain /appointments/list, not /appointments?patientId=... — the
                        latter is the CREATE flow (it auto-opens the "new appointment"
                        modal pre-filled with this patient), wrong for a "view all" link. */}
                    <Link
                      to="/appointments/list"
                      className="block text-center text-sm text-brand-500 hover:underline pt-1"
                    >
                      {t('uiClinical.viewAllAppointments')}
                    </Link>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="encounters">
              <Card
                title={t('uiClinical.encounterHistory')}
                actions={
                  <Button variant="outline" size="sm" onClick={() => navigate(`/medical-records/${id}`)}>
                    {t('uiClinical.viewAll')}
                  </Button>
                }
              >
                {!patient.summary || patient.summary.totalEncounters === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.noVisitHistory')}</p>
                ) : (
                  <div
                    className={`flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 dark:border-surface-700 ${
                      canViewEncounterDetail ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-800' : ''
                    }`}
                    onClick={
                      canViewEncounterDetail
                        ? () => navigate(`/medical-records/${id}`)
                        : undefined
                    }
                  >
                    <FileText className="h-5 w-5 shrink-0 text-gray-400 dark:text-surface-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-surface-100">
                          {t('uiClinical.totalEncounterCount', { count: patient.summary.totalEncounters })}
                        </span>
                      </div>
                      {patient.summary.lastVisitAt && (
                        <p className="text-sm text-gray-500 dark:text-surface-400">
                          {t('uiClinical.lastVisit')}: {formatDate(patient.summary.lastVisitAt)}
                          {patient.summary.lastVisitBy ? ` — ${patient.summary.lastVisitBy}` : ''}
                        </p>
                      )}
                      <p className="mt-0.5 text-sm text-brand-500">{t('uiClinical.viewEncounterDetails')}</p>
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="invoices">
              <Card
                title={t('uiClinical.invoice')}
                actions={
                  <Button variant="outline" size="sm" onClick={() => navigate('/billing/list')}>
                    {t('uiClinical.viewAll')}
                  </Button>
                }
              >
                {invoicesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800" />
                    ))}
                  </div>
                ) : recentInvoices.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.noInvoices')}</p>
                ) : (
                  <div className="space-y-2">
                    {recentInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50 dark:border-surface-700 dark:hover:bg-surface-800"
                        onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                      >
                        <Receipt className="h-5 w-5 shrink-0 text-gray-400 dark:text-surface-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-surface-100">{inv.code}</span>
                            <InvoiceStatusBadge status={inv.status} />
                          </div>
                          <p className="text-sm text-gray-500 dark:text-surface-400">
                            {formatDate(inv.createdAt)} • {formatCurrency(inv.total)}
                            {inv.outstandingAmount > 0 && (
                              <span className="text-amber-600"> — {t('uiClinical.outstandingAmount')} {formatCurrency(inv.outstandingAmount)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                    <Link
                      to="/billing/list"
                      className="block text-center text-sm text-brand-500 hover:underline pt-1"
                    >
                      {t('uiClinical.viewAllInvoices')}
                    </Link>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
