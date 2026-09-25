import { useState } from 'react';
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
import { DentistServicesCard } from '@/features/catalog/DentistServicesCard';
import {
  DAY_OF_WEEK_LABEL,
  PRACTICE_STATUS_LABEL,
  PRACTICE_STATUS_VARIANT,
  SPECIALTY_LABEL,
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

  if (isLoading) return <p className="text-sm text-gray-400">Đang tải…</p>;
  if (isError || !data) {
    return (
      <p className="text-sm text-red-500">
        Không tải được hồ sơ bác sĩ.{' '}
        <button type="button" className="underline" onClick={() => refetch()}>
          Thử lại
        </button>
      </p>
    );
  }
  const { profile, schedules, upcomingAppointments } = data;
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
                <Pencil className="h-4 w-4" /> Sửa hồ sơ
              </Button>
            )}
            {canChangeStatus &&
              (profile.practiceStatus === 'ACTIVE' ? (
                <Button variant="danger" onClick={() => setStatusDialog(true)}>
                  Tạm đình chỉ / ngừng
                </Button>
              ) : (
                <Button
                  isLoading={activate.isPending}
                  onClick={() =>
                    activate.mutate(undefined, {
                      onSuccess: () => notify.success('Bác sĩ đã hành nghề trở lại'),
                      onError: (e) => notify.error(staffErrorMessage(e, 'Không kích hoạt được')),
                    })
                  }
                >
                  Cho hành nghề lại
                </Button>
              ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Hồ sơ hành nghề" className="lg:col-span-1">
          <dl className="space-y-3">
            <Field label="Trạng thái">
              <Badge variant={PRACTICE_STATUS_VARIANT[profile.practiceStatus]}>
                {PRACTICE_STATUS_LABEL[profile.practiceStatus]}
              </Badge>
            </Field>
            <Field label="Chứng chỉ hành nghề">
              {profile.licenseNumber ?? '—'}
              {profile.licenseIssuedAt && ` (cấp ${formatDate(profile.licenseIssuedAt)})`}
            </Field>
            <Field label="Chuyên môn">
              {profile.specialties.length
                ? profile.specialties.map((s) => SPECIALTY_LABEL[s] ?? s).join(', ')
                : '—'}
            </Field>
            <Field label="Khe mặc định">{profile.defaultSlotMinutes} phút</Field>
            <Field label="Nhận bệnh nhân mới">{profile.acceptsNewPatients ? 'Có' : 'Không'}</Field>
            <Field label="Nhận đặt lịch online">
              {profile.acceptsOnlineBooking ? 'Có' : 'Không'}
            </Field>
            <Field label="Liên hệ">{[profile.phone, profile.email].filter(Boolean).join(' · ') || '—'}</Field>
            {profile.bio && <Field label="Giới thiệu">{profile.bio}</Field>}
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <DentistServicesCard
            dentistId={profile.userId}
            canAssign={profile.practiceStatus === 'ACTIVE'}
          />
          <Card title="Lịch làm việc cố định">
            {schedules.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có lịch làm việc.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm dark:divide-surface-800">
                {schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium">
                      {DAY_OF_WEEK_LABEL[s.dayOfWeek]} · {s.startTime}–{s.endTime}
                    </span>
                    <span className="text-xs text-gray-500">
                      Từ {formatDate(s.validFrom)}
                      {s.validTo ? ` đến ${formatDate(s.validTo)}` : ''} · khe {s.slotDurationMin}p
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Lịch hẹn sắp tới">
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-gray-500">Không có lịch hẹn sắp tới.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm dark:divide-surface-800">
                {upcomingAppointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {formatDateTime(a.startAt)} — {a.patient.fullName}{' '}
                      <span className="text-xs text-gray-500">({a.patient.code})</span>
                    </span>
                    <span className="text-xs uppercase text-gray-500">{a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Sửa hồ sơ bác sĩ" size="lg">
        {editing && (
          <DentistProfileForm
            initial={profile}
            mode={canEditAll ? 'admin' : 'self'}
            submitLabel="Lưu"
            submitting={update.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(payload) =>
              update.mutate(payload, {
                onSuccess: () => {
                  notify.success('Đã cập nhật hồ sơ bác sĩ');
                  setEditing(false);
                },
                onError: (e) => notify.error(staffErrorMessage(e, 'Không cập nhật được hồ sơ')),
              })
            }
          />
        )}
      </Modal>

      <Modal open={statusDialog} onClose={closeStatus} title={`Ngừng nhận lịch — ${profile.fullName}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            deactivate.mutate(undefined, {
              onSuccess: () => {
                notify.success('Đã cập nhật trạng thái hành nghề');
                closeStatus();
              },
              onError: (err) => {
                setBlocking(blockingAppointments(err));
                notify.error(staffErrorMessage(err, 'Không đổi được trạng thái'));
              },
            });
          }}
        >
          <p className="text-sm text-gray-600 dark:text-surface-300">
            Bác sĩ sẽ không còn trong danh sách chọn khi đặt lịch. Lịch làm việc và nghỉ phép vẫn
            quản lý được.
          </p>
          {blocking && <BlockingAppointmentsList appointments={blocking} />}
          <Select
            label="Trạng thái mới"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as 'SUSPENDED' | 'INACTIVE')}
            options={[
              { value: 'SUSPENDED', label: PRACTICE_STATUS_LABEL.SUSPENDED },
              { value: 'INACTIVE', label: PRACTICE_STATUS_LABEL.INACTIVE },
            ]}
          />
          <Textarea
            label="Lý do"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeStatus}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" isLoading={deactivate.isPending}>
              Xác nhận
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
