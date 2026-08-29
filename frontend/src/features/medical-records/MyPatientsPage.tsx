import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Card, SearchInput, EmptyState, StatusBadge } from '@/components/ui';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Patient {
  id: string;
  code: string;
  fullName: string;
  lastVisit?: string;
  status: 'active' | 'inactive';
}

// Mock data - replace with actual API call
const mockPatients: Patient[] = [
  { id: '1', code: 'PAT-2026-00012', fullName: 'Nguyễn Văn A', lastVisit: '2026-07-15', status: 'active' },
  { id: '2', code: 'PAT-2026-00045', fullName: 'Trần Thị B', lastVisit: '2026-07-10', status: 'active' },
  { id: '3', code: 'PAT-2026-00078', fullName: 'Lê Văn C', lastVisit: '2026-05-20', status: 'inactive' },
];

export default function MyPatientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [patients] = useState<Patient[]>(mockPatients);

  const filteredPatients = patients.filter(p =>
    p.fullName.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
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
            placeholder="Tìm theo tên, mã BN..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onClear={() => handleSearch('')}
          />
        </div>

        {filteredPatients.length === 0 ? (
          <EmptyState
            icon={<div className="text-4xl">👤</div>}
            title="Không tìm thấy bệnh nhân"
            description="Thử tìm kiếm với từ khóa khác"
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
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{patient.fullName}</p>
                      <StatusBadge status={patient.status} />
                    </div>
                    <p className="text-sm text-gray-500">{patient.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {patient.lastVisit ? (
                      <>
                        <p className="text-sm text-gray-500">Lần cuối khám</p>
                        <p className="font-medium text-gray-900">
                          {format(new Date(patient.lastVisit), 'dd/MM/yyyy', { locale: vi })}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">Chưa từng khám</p>
                    )}
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
