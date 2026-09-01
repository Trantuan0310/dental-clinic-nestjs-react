import { useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { CheckCircle2 } from 'lucide-react';
import { Button, Textarea, Alert } from '@/components/ui';
import type { Encounter } from '@/types/medical-records';

interface SummaryTabProps {
  encounter: Encounter;
  onClose: (summary: string) => void;
  isClosing: boolean;
}

export function SummaryTab({ encounter, onClose, isClosing }: SummaryTabProps) {
  const [summary, setSummary] = useState(encounter.summary || '');
  const [checkboxes, setCheckboxes] = useState({
    checked: false,
    explained: false,
    prescription: false,
  });

  const notes = encounter.notes || [];
  const treatments = encounter.treatments || [];
  const prescriptions = encounter.prescriptions || [];
  const chiefComplaint = notes.find((n) => n.type === 'chief_complaint');
  const diagnosis = notes.find((n) => n.type === 'diagnosis');

  const totalTreatmentCost = treatments.reduce((sum, t) => sum + (t.total ?? 0), 0);

  const allChecked = checkboxes.checked && checkboxes.explained && checkboxes.prescription;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-4">
        <h4 className="font-medium text-gray-900">Tóm tắt Encounter</h4>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Bệnh nhân</p>
            <p className="text-sm text-gray-600">{encounter.patientName}</p>
          </div>

          {chiefComplaint && (
            <div>
              <p className="text-sm font-medium text-gray-700">Lý do khám</p>
              <p className="text-sm text-gray-600">{chiefComplaint.content}</p>
            </div>
          )}

          {diagnosis && (
            <div>
              <p className="text-sm font-medium text-gray-700">Chẩn đoán</p>
              <p className="text-sm text-gray-600">{diagnosis.content}</p>
            </div>
          )}

          {treatments.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700">Điều trị</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-600">
                {treatments.map((t) => (
                  <li key={t.id}>
                    {t.procedureName} - Răng {t.toothNumber} ({formatCurrency(t.total)})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm font-medium text-gray-900">
                Tổng: {formatCurrency(totalTreatmentCost)}
              </p>
            </div>
          )}

          {prescriptions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700">Đơn thuốc</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-600">
                {prescriptions.map((p) => (
                  <li key={p.id}>{p.diagnosis || 'Đơn thuốc'}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Summary Input */}
      <Textarea
        label="Tóm tắt cuối cùng"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="VD: Hàn răng số 16, nhổ răng sữa 26, kê đơn..."
        rows={3}
      />

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkboxes.checked}
            onChange={(e) => setCheckboxes((c) => ({ ...c, checked: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            Tôi đã kiểm tra tất cả ghi chú và điều trị
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkboxes.explained}
            onChange={(e) => setCheckboxes((c) => ({ ...c, explained: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            Bệnh nhân đã được giải thích về tình trạng và kế hoạch điều trị
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkboxes.prescription}
            onChange={(e) => setCheckboxes((c) => ({ ...c, prescription: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            Đơn thuốc đã được in/giao cho bệnh nhân
          </span>
        </label>
      </div>

      <Alert type="info">
        Khi đóng Encounter, hệ thống sẽ tự động: tạo hóa đơn (draft) với các điều trị đã thực
        hiện, trừ tồn kho vật tư đã dùng, khóa ghi chú lâm sàng (read-only) và cập nhật trạng
        thái lịch hẹn = completed. Hành động này <strong>không thể hoàn tác</strong>.
      </Alert>

      {/* Close Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button
          onClick={() => onClose(summary)}
          isLoading={isClosing}
          disabled={!allChecked || !summary.trim()}
        >
          <CheckCircle2 className="h-4 w-4" />
          Đóng Encounter
        </Button>
      </div>
    </div>
  );
}
