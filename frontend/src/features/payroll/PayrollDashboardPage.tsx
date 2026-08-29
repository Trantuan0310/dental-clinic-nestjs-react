import { useState } from 'react';
import { Calendar, DollarSign, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { PayrollListPage } from './PayrollListPage';
import { CompensationListPage } from './CompensationListPage';
import { ShiftApprovalPage } from './ShiftApprovalPage';

export default function PayrollDashboardPage() {
  const [activeTab, setActiveTab] = useState('periods');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payroll</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý lương và ca làm việc
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="periods">
            <Calendar className="h-4 w-4 mr-2" />
            Kỳ lương
          </TabsTrigger>
          <TabsTrigger value="compensations">
            <DollarSign className="h-4 w-4 mr-2" />
            Chính sách lương
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <Users className="h-4 w-4 mr-2" />
            Duyệt ca
          </TabsTrigger>
        </TabsList>

        <TabsContent value="periods">
          <PayrollListPage />
        </TabsContent>

        <TabsContent value="compensations">
          <CompensationListPage />
        </TabsContent>

        <TabsContent value="shifts">
          <ShiftApprovalPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
