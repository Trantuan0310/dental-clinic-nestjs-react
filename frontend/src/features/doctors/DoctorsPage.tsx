import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';

type ServiceOption = { id: string; code: string; name: string; isActive: boolean };
type Doctor = {
  id: string;
  email: string;
  fullName: string;
  doctorProfile: null | {
    phone: string | null;
    specialty: string;
    licenseNumber: string | null;
    qualifications: string | null;
    yearsExperience: number;
    biography: string | null;
    acceptingAppointments: boolean;
  };
  doctorServices: Array<{ service: ServiceOption }>;
};
type ProfilePayload = {
  phone: string;
  specialty: string;
  licenseNumber: string;
  qualifications: string;
  yearsExperience: number;
  biography: string;
  acceptingAppointments: boolean;
  serviceIds: string[];
};

async function loadData<T>(url: string): Promise<T> {
  const response = await api.get<{ data: T }>(url);
  return response.data.data;
}

export default function DoctorsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Doctor | null>(null);
  const { data: doctors = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['clinic', 'doctors'],
    queryFn: () => loadData<Doctor[]>('/doctors'),
  });
  const { data: services = [] } = useQuery({
    queryKey: ['clinic', 'services'],
    queryFn: () => loadData<ServiceOption[]>('/services'),
  });
  const save = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ProfilePayload }) =>
      api.put(`/doctors/${id}/profile`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', 'doctors'] });
      setEditing(null);
      notify.success('Đã lưu hồ sơ bác sĩ');
    },
    onError: () => notify.error('Không thể lưu hồ sơ bác sĩ. Vui lòng thử lại.'),
  });
  const visibleDoctors = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    if (!text) return doctors;
    return doctors.filter(d => [d.fullName, d.email, d.doctorProfile?.specialty ?? '']
      .some(value => value.toLocaleLowerCase().includes(text)));
  }, [doctors, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quản lý bác sĩ</h1>
          <p className="mt-1 text-sm text-gray-500">Hồ sơ chuyên môn, giấy phép, dịch vụ phụ trách và trạng thái nhận lịch.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/schedule"><Button variant="outline"><CalendarClock className="h-4 w-4" />Cấu hình ca làm việc</Button></Link>
          <Link to="/admin/users"><Button><Plus className="h-4 w-4" />Tạo tài khoản bác sĩ</Button></Link>
        </div>
      </div>

      <Card noPadding>
        <div className="border-b border-gray-100 p-3">
          <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-md" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm bác sĩ theo tên, email, chuyên môn..." />
        </div>
        {isLoading ? <div className="flex justify-center p-8"><Spinner /></div> : isError ? (
          <EmptyState title="Không tải được danh sách bác sĩ" description="Kiểm tra kết nối rồi thử lại." action={{ label: 'Thử lại', onClick: () => refetch() }} />
        ) : doctors.length === 0 ? (
          <EmptyState title="Chưa có tài khoản bác sĩ" description="Tạo tài khoản có vai trò Bác sĩ trong mục Tài khoản nhân viên trước khi lập hồ sơ chuyên môn." action={{ label: 'Tạo tài khoản bác sĩ', onClick: () => navigate('/admin/users') }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-gray-50 text-gray-600"><th className="px-4 py-3">Bác sĩ</th><th className="px-4 py-3">Chuyên môn</th><th className="px-4 py-3">Dịch vụ được phân công</th><th className="px-4 py-3">Nhận lịch</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>{visibleDoctors.map(doctor => {
                const profile = doctor.doctorProfile;
                return <tr key={doctor.id} className="border-b border-gray-50">
                  <td className="px-4 py-3"><div className="font-medium text-gray-900">{doctor.fullName}</div><div className="text-xs text-gray-500">{doctor.email}{profile?.phone ? ` · ${profile.phone}` : ''}</div></td>
                  <td className="px-4 py-3">{profile?.specialty || <span className="text-amber-700">Chưa lập hồ sơ</span>}{profile?.licenseNumber && <div className="text-xs text-gray-500">GPLH: {profile.licenseNumber}</div>}</td>
                  <td className="px-4 py-3 text-gray-600">{doctor.doctorServices.filter(x => x.service.isActive).map(x => x.service.name).join(', ') || 'Chưa phân công'}</td>
                  <td className="px-4 py-3">{profile?.acceptingAppointments ? <span className="text-emerald-700">Đang nhận</span> : <span className="text-gray-500">Tạm dừng</span>}</td>
                  <td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => setEditing(doctor)}><Pencil className="h-4 w-4" />{profile ? 'Sửa hồ sơ' : 'Lập hồ sơ'}</Button></td>
                </tr>;
              })}</tbody>
            </table>
            {visibleDoctors.length === 0 && <p className="p-6 text-center text-sm text-gray-500">Không tìm thấy bác sĩ khớp với nội dung tìm kiếm.</p>}
          </div>
        )}
      </Card>

      {editing && <DoctorProfileModal key={editing.id} doctor={editing} services={services.filter(s => s.isActive)} onClose={() => setEditing(null)} onSave={payload => save.mutate({ id: editing.id, payload })} isSaving={save.isPending} />}
    </div>
  );
}

function DoctorProfileModal({ doctor, services, onClose, onSave, isSaving }: {
  doctor: Doctor; services: ServiceOption[]; onClose: () => void;
  onSave: (payload: ProfilePayload) => void; isSaving: boolean;
}) {
  const p = doctor.doctorProfile;
  const [phone, setPhone] = useState(p?.phone ?? '');
  const [specialty, setSpecialty] = useState(p?.specialty ?? '');
  const [licenseNumber, setLicenseNumber] = useState(p?.licenseNumber ?? '');
  const [qualifications, setQualifications] = useState(p?.qualifications ?? '');
  const [yearsExperience, setYearsExperience] = useState(String(p?.yearsExperience ?? 0));
  const [biography, setBiography] = useState(p?.biography ?? '');
  const [acceptingAppointments, setAcceptingAppointments] = useState(p?.acceptingAppointments ?? false);
  const [serviceIds, setServiceIds] = useState(doctor.doctorServices.filter(x => x.service.isActive).map(x => x.service.id));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ phone, specialty: specialty.trim(), licenseNumber, qualifications, yearsExperience: Number(yearsExperience), biography, acceptingAppointments, serviceIds });
  };
  return <Modal isOpen onClose={onClose} title={`Hồ sơ bác sĩ · ${doctor.fullName}`} size="lg">
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Chuyên môn" value={specialty} onChange={e => setSpecialty(e.target.value)} required placeholder="Ví dụ: Chỉnh nha" />
        <Input label="Số giấy phép hành nghề" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
        <Input label="Số điện thoại công việc" value={phone} onChange={e => setPhone(e.target.value)} />
        <Input label="Số năm kinh nghiệm" type="number" min="0" max="60" value={yearsExperience} onChange={e => setYearsExperience(e.target.value)} required />
      </div>
      <Textarea label="Bằng cấp / chứng chỉ" value={qualifications} onChange={e => setQualifications(e.target.value)} rows={2} />
      <Textarea label="Giới thiệu chuyên môn" value={biography} onChange={e => setBiography(e.target.value)} rows={3} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Dịch vụ bác sĩ được phân công</legend>
        {services.length ? <div className="grid gap-2 sm:grid-cols-2">{services.map(service => <label key={service.id} className="flex items-center gap-2 rounded border border-gray-200 p-2 text-sm"><input type="checkbox" checked={serviceIds.includes(service.id)} onChange={e => setServiceIds(current => e.target.checked ? [...current, service.id] : current.filter(id => id !== service.id))} />{service.name}<span className="text-xs text-gray-500">{service.code}</span></label>)}</div> : <p className="text-sm text-gray-500">Chưa có dịch vụ hoạt động. Hãy tạo danh mục dịch vụ trước.</p>}
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acceptingAppointments} onChange={e => setAcceptingAppointments(e.target.checked)} />Bác sĩ đang tiếp nhận lịch mới</label>
      <p className="text-xs text-gray-500">Trạng thái nhận lịch không thay thế lịch ca làm việc; cần cấu hình ca riêng tại mục Lịch làm việc.</p>
      <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" type="button" onClick={onClose}>Hủy</Button><Button type="submit" isLoading={isSaving} disabled={!specialty.trim()}>Lưu hồ sơ</Button></div>
    </form>
  </Modal>;
}
