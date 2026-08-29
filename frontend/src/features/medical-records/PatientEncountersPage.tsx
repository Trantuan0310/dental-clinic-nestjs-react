import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ArrowRight } from 'lucide-react';
import { Button, Card, StatusBadge, EmptyState } from '@/components/ui';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Encounter {
  id: string;
  code: string;
  date: string;
  dentistName: string;
  summary?: string;
  status: string;
}

export default function PatientEncountersPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Mock data - replace with actual API call
  const encounters: Encounter[] = [
    { id: '1', code: 'ENC-2026-00045', date: '2026-07-15T09:00:00Z', dentistName: 'Lê Văn C', summary: 'Hàn răng số 16, nhổ răng sữa 26', status: 'completed' },
    { id: '2', code: 'ENC-2026-00038', date: '2026-06-15T10:00:00Z', dentistName: 'Lê Văn C', summary: 'Khám định kỳ', status: 'completed' },
    { id: '3', code: 'ENC-2026-00025', date: '2026-03-10T14:00:00Z', dentistName: 'Phạm Thị D', summary: 'Nhổ răng khôn', status: 'completed' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Lịch sử khám</h1>
          <p className="mt-1 text-sm text-gray-500">Mã BN: {id}</p>
        </div>
      </div>

      <Card noPadding>
        {encounters.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10 text-gray-400" />}
            title="Chưa có lịch sử khám"
            description="Bệnh nhân này chưa từng được khám"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {encounters.map((encounter) => (
              <div
                key={encounter.id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/encounters/${encounter.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {format(new Date(encounter.date), 'dd/MM/yyyy', { locale: vi })}
                      </p>
                      <StatusBadge status={encounter.status === 'completed' ? 'completed' : encounter.status} />
                    </div>
                    <p className="text-sm text-gray-500">
                      BS. {encounter.dentistName} • {encounter.code}
                    </p>
                    {encounter.summary && (
                      <p className="mt-1 text-sm text-gray-600 truncate max-w-md">
                        {encounter.summary}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
