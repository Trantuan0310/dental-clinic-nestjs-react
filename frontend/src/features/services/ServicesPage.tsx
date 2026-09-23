import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';

type ClinicService = {
  id: string; code: string; name: string; category: string; description: string | null;
  durationMinutes: number; basePrice: string | number; requiresConsultation: boolean; isActive: boolean;
  dentists: Array<{ doctor: { id: string; fullName: string } }>;
};
type ServicePayload = Omit<ClinicService, 'id' | 'basePrice' | 'dentists'> & { basePrice: number };
async function listServices() {
  const response = await api.get<{ data: ClinicService[] }>('/services');
  return response.data.data;
}
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function ServicesPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ClinicService | 'new' | null>(null);
  const { data: services = [], isLoading, isError, refetch } = useQuery({ queryKey: ['clinic', 'services'], queryFn: listServices });
  const save = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: ServicePayload }) => id ? api.patch(`/services/${id}`, payload) : api.post('/services', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinic', 'services'] }); qc.invalidateQueries({ queryKey: ['clinic', 'doctors'] }); setEditing(null); notify.success('Đã lưu dịch vụ'); },
    onError: () => notify.error('Không thể lưu dịch vụ. Kiểm tra mã dịch vụ có bị trùng không.'),
  });
  const toggle = useMutation({
    mutationFn: (service: ClinicService) => api.patch(`/services/${service.id}`, { isActive: !service.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinic', 'services'] }); qc.invalidateQueries({ queryKey: ['clinic', 'doctors'] }); notify.success('Đã cập nhật trạng thái dịch vụ'); },
    onError: () => notify.error('Không thể cập nhật trạng thái dịch vụ.'),
  });
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return text ? services.filter(s => `${s.code} ${s.name} ${s.category}`.toLocaleLowerCase().includes(text)) : services;
  }, [services, query]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-gray-900">Danh mục dịch vụ</h1><p className="mt-1 text-sm text-gray-500">Quản lý mã, nhóm, thời lượng, giá tham khảo và điều kiện khám.</p></div><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Thêm dịch vụ</Button></div>
    <Card noPadding>
      <div className="border-b border-gray-100 p-3"><input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-md" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo mã, tên hoặc nhóm dịch vụ..." /></div>
      {isLoading ? <div className="flex justify-center p-8"><Spinner /></div> : isError ? <EmptyState title="Không tải được danh mục dịch vụ" description="Kiểm tra kết nối rồi thử lại." action={{ label: 'Thử lại', onClick: () => refetch() }} /> : services.length === 0 ? <EmptyState title="Danh mục dịch vụ đang trống" description="Thêm dịch vụ và sau đó phân công cho bác sĩ phù hợp." action={{ label: 'Thêm dịch vụ', onClick: () => setEditing('new') }} /> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-gray-50 text-gray-600"><th className="px-4 py-3">Mã / dịch vụ</th><th className="px-4 py-3">Nhóm</th><th className="px-4 py-3">Thời lượng</th><th className="px-4 py-3">Giá tham khảo</th><th className="px-4 py-3">Bác sĩ</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3"></th></tr></thead><tbody>{visible.map(service => <tr key={service.id} className="border-b border-gray-50"><td className="px-4 py-3"><div className="font-medium text-gray-900">{service.name}</div><div className="text-xs text-gray-500">{service.code}{service.requiresConsultation ? ' · Cần khám tư vấn' : ''}</div></td><td className="px-4 py-3">{service.category}</td><td className="px-4 py-3">{service.durationMinutes} phút</td><td className="px-4 py-3">{money.format(Number(service.basePrice))}</td><td className="px-4 py-3">{service.dentists.map(x => x.doctor.fullName).join(', ') || 'Chưa phân công'}</td><td className="px-4 py-3">{service.isActive ? <span className="text-emerald-700">Đang hoạt động</span> : <span className="text-gray-500">Ngừng hoạt động</span>}</td><td className="whitespace-nowrap px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => setEditing(service)}><Pencil className="h-4 w-4" />Sửa</Button><Button variant="ghost" size="sm" onClick={() => toggle.mutate(service)} disabled={toggle.isPending}>{service.isActive ? 'Ngừng' : 'Kích hoạt'}</Button></td></tr>)}</tbody></table>{visible.length === 0 && <p className="p-6 text-center text-sm text-gray-500">Không tìm thấy dịch vụ khớp với nội dung tìm kiếm.</p>}</div>}
    </Card>
    {editing && <ServiceModal key={editing === 'new' ? 'new' : editing.id} service={editing === 'new' ? null : editing} isSaving={save.isPending} onClose={() => setEditing(null)} onSave={payload => save.mutate({ id: editing === 'new' ? null : editing.id, payload })} />}
  </div>;
}

function ServiceModal({ service, isSaving, onClose, onSave }: { service: ClinicService | null; isSaving: boolean; onClose: () => void; onSave: (payload: ServicePayload) => void }) {
  const [code, setCode] = useState(service?.code ?? '');
  const [name, setName] = useState(service?.name ?? '');
  const [category, setCategory] = useState(service?.category ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(service?.durationMinutes ?? 30));
  const [basePrice, setBasePrice] = useState(String(service?.basePrice ?? 0));
  const [requiresConsultation, setRequiresConsultation] = useState(service?.requiresConsultation ?? false);
  const submit = (e: React.FormEvent) => { e.preventDefault(); onSave({ code: code.trim().toUpperCase(), name: name.trim(), category: category.trim(), description, durationMinutes: Number(durationMinutes), basePrice: Number(basePrice), requiresConsultation, isActive: service?.isActive ?? true }); };
  return <Modal isOpen onClose={onClose} title={service ? 'Cập nhật dịch vụ' : 'Thêm dịch vụ'} size="md"><form onSubmit={submit} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Input label="Mã dịch vụ" required value={code} onChange={e => setCode(e.target.value)} placeholder="VD: KHAM-01" /><Input label="Tên dịch vụ" required value={name} onChange={e => setName(e.target.value)} /><Input label="Nhóm dịch vụ" required value={category} onChange={e => setCategory(e.target.value)} placeholder="Khám tổng quát, điều trị..." /><Input label="Thời lượng (phút)" type="number" min="5" max="1440" required value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} /><Input label="Giá tham khảo (VNĐ)" type="number" min="0" step="1000" required value={basePrice} onChange={e => setBasePrice(e.target.value)} /></div>
    <Textarea label="Mô tả" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresConsultation} onChange={e => setRequiresConsultation(e.target.checked)} />Cần khám tư vấn trước khi thực hiện</label>
    <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" type="button" onClick={onClose}>Hủy</Button><Button type="submit" isLoading={isSaving} disabled={!code.trim() || !name.trim() || !category.trim()}>Lưu dịch vụ</Button></div>
  </form></Modal>;
}
