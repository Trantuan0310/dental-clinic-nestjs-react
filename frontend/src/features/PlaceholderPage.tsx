import { Link } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-500">
          <Hammer className="h-10 w-10 text-gray-400" />
          <h3 className="text-base font-medium text-gray-900">Module đang được phát triển</h3>
          <p className="max-w-md text-sm">
            Trang này thuộc module khác (Patients, Appointments, Inventory, v.v.) — sẽ được build ở các phase sau.
            Hiện tại Phase 10 tập trung vào <strong>Payroll & Shift Management</strong>.
          </p>
          <Link to="/">
            <Button variant="outline">Về trang chủ</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}