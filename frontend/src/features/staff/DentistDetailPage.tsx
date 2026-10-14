import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Badge, Button, Card, Modal, Select, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatDateTime } from '@/lib/format';
import { staffApi, useDentistOverview, useStaffMutation } from './staffApi';
import { DentistProfileForm } from './DentistProfileForm';
import { BlockingAppointmentsList } from './BlockingAppointmentsList';
import { DentistReadinessCard } from './DentistReadinessCard';
import { DentistServicesCard } from '@/features/catalog/DentistServicesCard';
import { DentistPhotoCard } from '@/features/media/DentistPhotoCard';
import {
  PRACTICE_STATUS_VARIANT,
  blockingAppointments,
  staffErrorMessage,
} from './labels';
import type { BlockingAppointment, DentistProfilePayload } from './types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-surface-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-surface-100">{children}</dd>
    </div>
  );
}

export default function DentistDetailPage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const { data, isLoading, isError, refetch } = useDentistOverview(userId);
  const me = useAuthStore((s) => s.user?.id);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEditAll = hasPermission('dentist.update');
  const canEditOwn = !canEditAll && hasPermission('dentist.update.own') && me === userId;
  const canChangeStatus = hasPermission('dentist.deactivate');

  const [editing, setEditing] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<'SUSPENDED' | 'INACTIVE'>('SUSPENDED');
  const [reason, setReason] = useState('');
  const [blocking, setBlocking] = useState<BlockingAppointment[] | null>(null);

  const update = useStaffMutation((payload: DentistProfilePayload) =>
    staffApi.updateDentist(userId!, payload),
  );
  const deactivate = useStaffMutation(() =>
    staffApi.deactivateDentist(userId!, { status: newStatus, reason: reason.trim() }),
  );
  const activate = useStaffMutation(() => staffApi.activateDentist(userId!));

  if (isLoading) return <p className="text-sm text-gray-500 dark:text-surface-400">{t('common.loading')}</p>;
  if (isError || !data) {
    return (
      <p className="text-sm text-red-500">
        {t('uiWorkforce.dentistProfileLoadError')}{' '}
        <button type="button" className="underline" onClick={() => refetch()}>
          {t('uiWorkforce.retry')}
        </button>
      </p>
    );
  }
  const { profile, readiness, schedules, upcomingAppointments } = data;
  const closeStatus = () => {
    setStatusDialog(false);
    setBlocking(null);
    setReason('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        backTo="/dentists"
        title={
          <span className="inline-flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: profile.calendarColor }}
              aria-hidden
            />
            {profile.fullName}
          </span>
        }
        description={`${profile.employeeCode} · ${profile.loginEmail}`}
        actions={
          <>
            {(canEditAll || canEditOwn) && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> {t('uiWorkforce.editProfile')}
              </Button>
            )}
            {canChangeStatus &&
              (profile.practiceStatus === 'ACTIVE' ? (
                <Button variant="danger" onClick={() => setStatusDialog(true)}>
                  {t('uiWorkforce.suspendOrStopPractice')}
                </Button>
              ) : (
                <Button
                  isLoading={activate.isPending}
                  onClick={() =>
                    activate.mutate(undefined, {
                      onSuccess: () => notify.success(t('uiWorkforce.practiceReactivated')),
                      onError: (e) => notify.error(staffErrorMessage(e, t('uiWorkforce.practiceReactivateError'))),
                    })
                  }
                >
                  {t('uiWorkforce.reactivatePractice')}
                </Button>
              ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          {readiness && (
            <DentistReadinessCard
              readiness={readiness}
              onEditProfile={canEditAll ? () => setEditing(true) : undefined}
            />
          )}
          <Card title={t('uiWorkforce.dentistPracticeProfile')}>
            <dl className="space-y-3">
              <Field label={t('uiWorkforce.status')}>
                <Badge variant={PRACTICE_STATUS_VARIANT[profile.practiceStatus]}>
                  {t(`uiWorkforce.practiceStatus_${profile.practiceStatus}`)}
                </Badge>
              </Field>
              <Field label={t('uiWorkforce.licenseNumber')}>
                {profile.licenseNumber ?? '—'}
                {profile.licenseIssuedAt && ` (${t('uiWorkforce.issuedOn', { date: formatDate(profile.licenseIssuedAt) })})`}
              </Field>
              <Field label={t('uiWorkforce.specialties')}>
                {profile.specialties.length
                  ? profile.specialties.map((s) => t(`uiWorkforce.specialty_${s}`, { defaultValue: s })).join(', ')
                  : '—'}
              </Field>
              <Field label={t('uiWorkforce.defaultSlotDuration')}>{t('uiWorkforce.minutesShort', { minutes: profile.defaultSlotMinutes })}</Field>
              <Field label={t('uiWorkforce.acceptsNewPatients')}>{profile.acceptsNewPatients ? t('common.yes') : t('common.no')}
              </Field>
              <Field label={t('uiWorkforce.acceptsOnlineBooking')}>
                {profile.acceptsOnlineBooking ? t('common.yes') : t('common.no')}
              </Field>
              <Field label={t('uiWorkforce.contact')}>{[profile.phone, profile.email].filter(Boolean).join(' · ') || '—'}</Field>
              {profile.bio && <Field label={t('uiWorkforce.dentistBio')}>{profile.bio}</Field>}
            </dl>
          </Card>
          <div id="dentist-photo" className="scroll-mt-20">
            <DentistPhotoCard dentistId={profile.userId} canEdit={canEditAll || canEditOwn} />
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div id="dentist-services" className="scroll-mt-20">
            <DentistServicesCard
              dentistId={profile.userId}
              canAssign={profile.practiceStatus === 'ACTIVE'}
            />
          </div>
          <Card title={t('uiWorkforce.regularWorkSchedule')}>
            {schedules.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.noWorkSchedule')}</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm dark:divide-surface-800">
                {schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium">
                      {t(`uiWorkforce.day_${s.dayOfWeek}`)} · {s.startTime}–{s.endTime}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-surface-400">
                      {t('uiWorkforce.scheduleEffectiveFrom', { date: formatDate(s.validFrom) })}
                      {s.validTo ? ` ${t('uiWorkforce.scheduleEffectiveTo', { date: formatDate(s.validTo) })}` : ''} · {t('uiWorkforce.minutesShort', { minutes: s.slotDurationMin })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('uiWorkforce.upcomingAppointments')}>
            {upcomingAppointments === null ? (
              <p className="text-sm text-gray-500 dark:text-surface-400">
                {t('uiWorkforce.otherDentistAppointmentsHidden')}
              </p>
            ) : upcomingAppointments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.noUpcomingAppointments')}</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm dark:divide-surface-800">
                {upcomingAppointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {formatDateTime(a.startAt)} — {a.patient.fullName}{' '}
                      <span className="text-xs text-gray-500 dark:text-surface-400">({a.patient.code})</span>
                    </span>
                    <span className="text-xs uppercase text-gray-500 dark:text-surface-400">{t(`uiWorkforce.appointmentStatus_${a.status}`, { defaultValue: a.status })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={t('uiWorkforce.editDentistProfile')} size="lg">
        {editing && (
          <DentistProfileForm
            initial={profile}
            mode={canEditAll ? 'admin' : 'self'}
            submitLabel={t('uiWorkforce.save')}
            submitting={update.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(payload) =>
              update.mutate(payload, {
                onSuccess: () => {
                  notify.success(t('uiWorkforce.dentistProfileUpdated'));
                  setEditing(false);
                },
                onError: (e) => notify.error(staffErrorMessage(e, t('uiWorkforce.dentistProfileUpdateError'))),
              })
            }
          />
        )}
      </Modal>

      <Modal open={statusDialog} onClose={closeStatus} title={t('uiWorkforce.stopAcceptingAppointmentsFor', { name: profile.fullName })}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            deactivate.mutate(undefined, {
              onSuccess: () => {
                notify.success(t('uiWorkforce.practiceStatusUpdated'));
                closeStatus();
              },
              onError: (err) => {
                setBlocking(blockingAppointments(err));
                notify.error(staffErrorMessage(err, t('uiWorkforce.practiceStatusUpdateError')));
              },
            });
          }}
        >
          <p className="text-sm text-gray-600 dark:text-surface-300">
            {t('uiWorkforce.stopAcceptingAppointmentsDescription')}
          </p>
          {blocking && <BlockingAppointmentsList appointments={blocking} />}
          <Select
            label={t('uiWorkforce.newPracticeStatus')}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as 'SUSPENDED' | 'INACTIVE')}
            options={[
              { value: 'SUSPENDED', label: t('uiWorkforce.practiceStatus_SUSPENDED') },
              { value: 'INACTIVE', label: t('uiWorkforce.practiceStatus_INACTIVE') },
            ]}
          />
          <Textarea
            label={t('uiWorkforce.reason')}
            required
            minLength={5}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeStatus}>
              {t('uiWorkforce.cancel')}
            </Button>
            <Button type="submit" variant="danger" isLoading={deactivate.isPending}>
              {t('uiWorkforce.confirm')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
