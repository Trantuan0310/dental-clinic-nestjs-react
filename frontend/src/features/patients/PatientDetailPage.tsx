import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
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

export default function PatientDetailPage() {
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
  const { data: appointmentsData, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['patient-appointments', id],
    queryFn: () => appointmentsApi.list({ patientId: id!, pageSize: 5 }),
    enabled: !!id,
  });
  const recentAppointments = appointmentsData?.data ?? [];

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
        <p className="text-gray-500">Không tìm thấy bệnh nhân</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/patients')}>
          Quay lại danh sách
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/patients')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{patient.fullName}</h1>
            <StatusBadge status={patient.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {patient.code}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/patients/${id}/edit`)}>
            <Edit className="h-4 w-4" />
            Sửa
          </Button>
          <PermissionGuard permission="appointment.create">
            <Button onClick={() => navigate(`/appointments?patientId=${id}`)}>
              <Calendar className="h-4 w-4" />
              Đặt lịch hẹn
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
                <span className="font-medium">Dị ứng:</span>
                {patient.allergies?.join(', ')}
              </div>
            </Alert>
          )}
          {hasChronicDiseases && (
            <Alert type="warning">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Bệnh mãn tính:</span>
                {patient.chronicDiseases?.join(', ')}
              </div>
            </Alert>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sidebar Info */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <span className="text-xl font-semibold">
                  {patient.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-base font-medium text-gray-900">{patient.fullName}</p>
                <p className="text-sm text-gray-500">
                  {age !== null ? `${age} tuổi • ` : ''}
                  {patient.gender === 'male' ? 'Nam' : patient.gender === 'female' ? 'Nữ' : 'Khác'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
              {patient.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{formatPhone(patient.phone)}</span>
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{patient.email}</span>
                </div>
              )}
              {patient.address && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{patient.address}</span>
                </div>
              )}
              {patient.occupation && (
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  <span>{patient.occupation}</span>
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-500">
              <p>
                Ngày sinh:{' '}
                {patient.dateOfBirth
                  ? format(new Date(patient.dateOfBirth), 'dd/MM/yyyy', { locale: vi })
                  : '-'}
              </p>
              <p>Ngày tạo: {format(new Date(patient.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}</p>
            </div>
          </Card>

          {/* Current Medications */}
          {patient.currentMedications && patient.currentMedications.length > 0 && (
            <Card title="Thuốc đang dùng">
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
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Tổng quan</TabsTrigger>
              <TabsTrigger value="appointments">Lịch hẹn</TabsTrigger>
              <TabsTrigger value="encounters">Lịch sử khám</TabsTrigger>
              <TabsTrigger value="invoices">Hóa đơn</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card title="Thống kê">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xl font-semibold text-gray-900">
                      {patient.summary?.totalEncounters ?? 0}
                    </p>
                    <p className="text-sm text-gray-500">Tổng lượt khám</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xl font-semibold text-gray-900">
                      {patient.summary?.lastVisitAt
                        ? format(new Date(patient.summary.lastVisitAt), 'dd/MM/yyyy', {
                            locale: vi,
                          })
                        : 'Chưa có'}
                    </p>
                    <p className="text-sm text-gray-500">Tái khám gần nhất</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xl font-semibold text-gray-900">
                      {patient.allergies?.length || 0}
                    </p>
                    <p className="text-sm text-gray-500">Dị ứng</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xl font-semibold text-gray-900">
                      {patient.chronicDiseases?.length || 0}
                    </p>
                    <p className="text-sm text-gray-500">Bệnh mãn tính</p>
                  </div>
                </div>
              </Card>

              {patient.notes && (
                <Card title="Ghi chú" className="mt-3">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{patient.notes}</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="appointments">
              <Card
                title="Lịch hẹn gần đây"
                actions={
                  <PermissionGuard permission="appointment.create">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/appointments?patientId=${id}`)}
                    >
                      <Plus className="h-4 w-4" />
                      Đặt lịch hẹn
                    </Button>
                  </PermissionGuard>
                }
              >
                {appointmentsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
                    ))}
                  </div>
                ) : recentAppointments.length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có lịch hẹn nào</p>
                ) : (
                  <div className="space-y-2">
                    {recentAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 cursor-pointer hover:bg-gray-50"
                        onClick={() => navigate(`/appointments/list?open=${apt.id}`)}
                      >
                        <Calendar className="h-5 w-5 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {formatDate(apt.startsAt)} •{' '}
                              {formatTimeOnly(apt.startsAt)}
                            </span>
                            <StatusBadge status={apt.status} />
                          </div>
                          <p className="text-sm text-gray-500">{apt.dentistName}</p>
                          {apt.reason && (
                            <p className="mt-0.5 text-sm text-gray-600 truncate">{apt.reason}</p>
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
                      Xem tất cả lịch hẹn →
                    </Link>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="encounters">
              <Card
                title="Lịch sử khám"
                actions={
                  <Button variant="outline" size="sm" onClick={() => navigate(`/medical-records/${id}`)}>
                    Xem tất cả
                  </Button>
                }
              >
                {!patient.summary || patient.summary.totalEncounters === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có lịch sử khám</p>
                ) : (
                  <div
                    className={`flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 ${
                      canViewEncounterDetail ? 'cursor-pointer hover:bg-gray-50' : ''
                    }`}
                    onClick={
                      canViewEncounterDetail
                        ? () => navigate(`/medical-records/${id}`)
                        : undefined
                    }
                  >
                    <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {patient.summary.totalEncounters} lượt khám
                        </span>
                      </div>
                      {patient.summary.lastVisitAt && (
                        <p className="text-sm text-gray-500">
                          Gần nhất: {format(new Date(patient.summary.lastVisitAt), 'dd/MM/yyyy', { locale: vi })}
                          {patient.summary.lastVisitBy ? ` — ${patient.summary.lastVisitBy}` : ''}
                        </p>
                      )}
                      <p className="mt-0.5 text-sm text-brand-500">Xem chi tiết từng lượt khám →</p>
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="invoices">
              <Card
                title="Hóa đơn"
                actions={
                  <Button variant="outline" size="sm" onClick={() => navigate('/billing/list')}>
                    Xem tất cả
                  </Button>
                }
              >
                {invoicesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
                    ))}
                  </div>
                ) : recentInvoices.length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có hóa đơn nào</p>
                ) : (
                  <div className="space-y-2">
                    {recentInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 cursor-pointer hover:bg-gray-50"
                        onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                      >
                        <Receipt className="h-5 w-5 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{inv.code}</span>
                            <InvoiceStatusBadge status={inv.status} />
                          </div>
                          <p className="text-sm text-gray-500">
                            {format(new Date(inv.createdAt), 'dd/MM/yyyy', { locale: vi })} • {formatCurrency(inv.total)}
                            {inv.outstandingAmount > 0 && (
                              <span className="text-amber-600"> — còn nợ {formatCurrency(inv.outstandingAmount)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                    <Link
                      to="/billing/list"
                      className="block text-center text-sm text-brand-500 hover:underline pt-1"
                    >
                      Xem tất cả hóa đơn →
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
