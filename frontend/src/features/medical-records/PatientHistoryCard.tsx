import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Button, Card, Modal, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

interface MedicalHistory {
  allergies: string[];
  chronicDiseases: string[];
  currentMedications: string[];
}

const FIELDS: Array<{ key: keyof MedicalHistory; label: string; empty: string }> = [
  { key: 'allergies', label: 'Dị ứng', empty: 'Chưa ghi nhận' },
  { key: 'chronicDiseases', label: 'Bệnh nền', empty: 'Không' },
  { key: 'currentMedications', label: 'Thuốc đang dùng', empty: 'Không' },
];

const toLines = (list: string[]) => list.join('\n');
const fromLines = (text: string) =>
  text
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Allergies, chronic diseases and current medications next to the visit, so
 * the dentist sees them before treating and can record a new finding
 * (patient.medical_history.update, own patients) without asking front desk.
 */
export function PatientHistoryCard({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const canEdit = useAuthStore(
    (s) => s.hasPermission('patient.medical_history.update') || s.hasPermission('patient.update'),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<keyof MedicalHistory, string>>({
    allergies: '',
    chronicDiseases: '',
    currentMedications: '',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patients', 'medical-history', patientId],
    queryFn: async () =>
      (await api.get<{ data: MedicalHistory }>(`/patients/${patientId}`)).data.data,
  });

  const save = useMutation({
    mutationFn: async (body: MedicalHistory) =>
      (await api.patch<{ data: MedicalHistory }>(`/patients/${patientId}/medical-history`, body)).data
        .data,
    onSuccess: (saved) => {
      qc.setQueryData(['patients', 'medical-history', patientId], saved);
      qc.invalidateQueries({ queryKey: ['patients', 'detail', patientId] });
      qc.invalidateQueries({ queryKey: ['ai-summary', patientId] });
      notify.success('Đã cập nhật tiền sử bệnh nhân');
      setEditing(false);
    },
    onError: (e) => notify.error(getApiErrorMessage(e, 'Không lưu được tiền sử')),
  });

  const history: MedicalHistory = {
    allergies: data?.allergies ?? [],
    chronicDiseases: data?.chronicDiseases ?? [],
    currentMedications: data?.currentMedications ?? [],
  };

  return (
    <Card noPadding className="p-4">
      <section aria-labelledby="patient-history-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="patient-history-title" className="text-sm font-semibold text-gray-900">
          Tiền sử &amp; dị ứng
        </h2>
        {canEdit && data && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft({
                allergies: toLines(history.allergies),
                chronicDiseases: toLines(history.chronicDiseases),
                currentMedications: toLines(history.currentMedications),
              });
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Sửa
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="mt-2 text-sm text-gray-500">Đang tải…</p>
      ) : isError ? (
        <p className="mt-2 text-sm text-gray-500">Không tải được tiền sử bệnh nhân.</p>
      ) : (
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {FIELDS.map(({ key, label, empty }) => (
            <div key={key}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {history[key].length === 0 ? (
                  <span className="text-sm text-gray-400">{empty}</span>
                ) : (
                  history[key].map((item) => (
                    <span
                      key={item}
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (key === 'allergies'
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                          : 'bg-gray-100 text-gray-700')
                      }
                    >
                      {key === 'allergies' && <AlertTriangle className="h-3 w-3" aria-hidden />}
                      {item}
                    </span>
                  ))
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      </section>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Cập nhật tiền sử bệnh nhân"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Hủy
            </Button>
            <Button
              isLoading={save.isPending}
              onClick={() =>
                save.mutate({
                  allergies: fromLines(draft.allergies),
                  chronicDiseases: fromLines(draft.chronicDiseases),
                  currentMedications: fromLines(draft.currentMedications),
                })
              }
            >
              Lưu
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Mỗi dòng một mục (hoặc ngăn cách bằng dấu phẩy).</p>
          {FIELDS.map(({ key, label }) => (
            <Textarea
              key={key}
              label={label}
              rows={3}
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          ))}
        </div>
      </Modal>
    </Card>
  );
}
