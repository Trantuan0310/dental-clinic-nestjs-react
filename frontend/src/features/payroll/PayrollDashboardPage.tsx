import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, DollarSign, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { PayrollListPage } from './PayrollListPage';
import { CompensationListPage } from './CompensationListPage';
import ShiftApprovalInbox from '@/features/shift/ShiftApprovalInbox';

export default function PayrollDashboardPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('periods');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payroll')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('uiWorkforce.payrollDescription')}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="periods">
            <Calendar className="h-4 w-4 mr-2" />
            {t('uiWorkforce.periods')}
          </TabsTrigger>
          <TabsTrigger value="compensations">
            <DollarSign className="h-4 w-4 mr-2" />
            {t('uiWorkforce.compensation')}
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <Users className="h-4 w-4 mr-2" />
            {t('uiWorkforce.approveShifts')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="periods">
          <PayrollListPage />
        </TabsContent>

        <TabsContent value="compensations">
          <CompensationListPage />
        </TabsContent>

        <TabsContent value="shifts">
          <ShiftApprovalInbox />
        </TabsContent>
      </Tabs>
    </div>
  );
}
