import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { Button, Card, SearchInput, EmptyState } from '@/components/ui';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useAuthStore } from '@/stores/authStore';
import { useEncounterList } from './medicalRecordsApi';

interface PatientRow {
  id: string;
  fullName: string;
  lastVisit: string;
}

export default function MyPatientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const dentistId = useAuthStore((s) => s.user?.id);

  const { data: encounters, isLoading } = useEncounterList({
    dentistId,
    pageSize: 500,
  });

  // No dedicated "my patients" endpoint exists — derive the distinct patient
  // list from this dentist's encounters, keeping the most recent visit date
  // per patient.
  const patients = useMemo<PatientRow[]>(() => {
    const byId = new Map<string, PatientRow>();
    for (const enc of encounters ?? []) {
      const existing = byId.get(enc.patientId);
      if (!existing || new Date(enc.startedAt) > new Date(existing.lastVisit)) {
        byId.set(enc.patientId, {
          id: enc.patientId,
          fullName: enc.patientName,
          lastVisit: enc.startedAt,
        });
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime(),
    );
  }, [encounters]);

  const filteredPatients = patients.filter((p) =>
    p.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Bệnh nhân của tôi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Danh sách bệnh nhân bạn đã từng khám
        </p>
      </div>

      <Card noPadding>
        <div className="p-4">
          <SearchInput
            placeholder="Tìm theo tên bệnh nhân..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onClear={() => handleSearch('')}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : filteredPatients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10 text-gray-400" />}
            title={search ? 'Không tìm thấy bệnh nhân' : 'Chưa có bệnh nhân nào'}
            description={
              search ? 'Thử tìm kiếm với từ khóa khác' : 'Bệnh nhân sẽ xuất hiện sau khi bạn hoàn thành ca khám đầu tiên'
            }
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredPatients.map((patient) => (
              <div
                key={patient.id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/patients/${patient.id}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <span className="text-lg font-semibold">
                      {patient.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">{patient.fullName}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Lần cuối khám</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(patient.lastVisit), 'dd/MM/yyyy', { locale: vi })}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
