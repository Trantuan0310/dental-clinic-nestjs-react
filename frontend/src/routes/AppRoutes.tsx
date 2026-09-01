import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { SessionBoot } from '@/features/auth/SessionBoot';
import { PageLoader } from '@/components/ui/Loading';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ForbiddenPage, NotFoundPage } from '@/features/auth/ErrorPages';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/features/DashboardPage'));

const PatientListPage = lazy(() => import('@/features/patients/PatientListPage'));
const PatientDetailPage = lazy(() => import('@/features/patients/PatientDetailPage'));
const PatientForm = lazy(() =>
  import('@/features/patients/PatientForm').then((m) => ({ default: m.PatientForm })),
);

const AppointmentCalendarPage = lazy(
  () => import('@/features/appointments/AppointmentCalendarPage'),
);
const AppointmentsListPage = lazy(() => import('@/features/appointments/AppointmentsListPage'));

const TodayPage = lazy(() => import('@/features/medical-records/TodayPage'));
const MyQueuePage = lazy(() => import('@/features/medical-records/MyQueuePage'));
const MyPatientsPage = lazy(() => import('@/features/medical-records/MyPatientsPage'));
const PatientEncountersPage = lazy(
  () => import('@/features/medical-records/PatientEncountersPage'),
);
const EncounterDetailPage = lazy(
  () => import('@/features/medical-records/EncounterDetailPage'),
);

const InvoiceDetailPage = lazy(() => import('@/features/billing/InvoiceDetailPage'));

const InventoryListPage = lazy(() => import('@/features/inventory/InventoryListPage'));
const InventoryItemDetailPage = lazy(
  () => import('@/features/inventory/InventoryItemDetailPage'),
);

const ExpenseListPage = lazy(() => import('@/features/expense/ExpenseListPage'));

const PayrollDashboardPage = lazy(() => import('@/features/payroll/PayrollDashboardPage'));
const PeriodDetailPage = lazy(() => import('@/features/payroll/PeriodDetailPage'));
const PayrollConfigPage = lazy(() => import('@/features/payroll/PayrollConfigPage'));
const CompensationListPage = lazy(() =>
  import('@/features/payroll/CompensationListPage').then((m) => ({ default: m.CompensationListPage })),
);
const MyCompensationPage = lazy(() => import('@/features/payroll/MyCompensationPage'));
const MyPayrollPreviewPage = lazy(
  () => import('@/features/payroll/MyPayrollPreviewPage'),
);
const MyPayslipPage = lazy(() => import('@/features/payroll/MyPayslipPage'));
const MyPayrollHistoryPage = lazy(
  () => import('@/features/payroll/MyPayrollHistoryPage'),
);

const ShiftApprovalInbox = lazy(() => import('@/features/shift/ShiftApprovalInbox'));
const MyShiftsSelfPage = lazy(() => import('@/features/shift/MyShiftsPage'));

const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const UsersPage = lazy(() => import('@/features/admin/UsersPage'));
const RolesPage = lazy(() => import('@/features/admin/RolesPage'));
const AuditLogsPage = lazy(() => import('@/features/admin/AuditLogsPage'));
const SettingsPage = lazy(() => import('@/features/admin/SettingsPage'));

const BrandPreviewPage = lazy(() => import('@/features/brand/BrandPreviewPage'));

function SuspenseBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <SessionBoot>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route
                index
                element={
                  <ProtectedRoute anyPermission={['appointment.read', 'encounter.read', 'invoice.read', 'report.read']}>
                    <ErrorBoundary componentName="Dashboard">
                      <DashboardPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />

              <Route
                path="patients"
                element={
                  <ProtectedRoute permission="patient.read">
                    <ErrorBoundary componentName="PatientListPage">
                      <PatientListPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="patients/new"
                element={
                  <ProtectedRoute permission="patient.create">
                    <SuspenseBoundary>
                      <ErrorBoundary componentName="PatientForm">
                        <PatientForm />
                      </ErrorBoundary>
                    </SuspenseBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="patients/:id"
                element={
                  <ProtectedRoute permission="patient.read">
                    <ErrorBoundary componentName="PatientDetailPage">
                      <PatientDetailPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="patients/:id/edit"
                element={
                  <ProtectedRoute permission="patient.update">
                    <SuspenseBoundary>
                      <ErrorBoundary componentName="PatientForm (edit)">
                        <PatientForm />
                      </ErrorBoundary>
                    </SuspenseBoundary>
                  </ProtectedRoute>
                }
              />

              <Route
                path="appointments"
                element={
                  <ProtectedRoute permission="appointment.read">
                    <ErrorBoundary componentName="AppointmentCalendarPage">
                      <AppointmentCalendarPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="appointments/list"
                element={
                  <ProtectedRoute permission="appointment.read">
                    <ErrorBoundary componentName="AppointmentsListPage">
                      <AppointmentsListPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />

              <Route
                path="today"
                element={
                  <ProtectedRoute permission="encounter.read">
                    <TodayPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-queue"
                element={
                  <ProtectedRoute permission="encounter.read">
                    <MyQueuePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="medical-records"
                element={
                  <ProtectedRoute permission="medical_record.read">
                    <PatientEncountersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="medical-records/:patientId"
                element={
                  <ProtectedRoute permission="medical_record.read">
                    <PatientEncountersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-patients"
                element={
                  <ProtectedRoute permission="patient.read">
                    <MyPatientsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="encounters/:id"
                element={
                  <ProtectedRoute permission="encounter.read">
                    <EncounterDetailPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="billing"
                element={
                  <ProtectedRoute permission="invoice.read">
                    <Navigate to="/billing/list" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="billing/list"
                element={
                  <ProtectedRoute permission="invoice.read">
                    <InvoiceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="billing/invoices/:id"
                element={
                  <ProtectedRoute permission="invoice.read">
                    <InvoiceDetailPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="inventory"
                element={
                  <ProtectedRoute permission="inventory.read">
                    <InventoryListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="inventory/items/:id"
                element={
                  <ProtectedRoute permission="inventory.read">
                    <InventoryItemDetailPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="expenses"
                element={
                  <ProtectedRoute permission="expense.read">
                    <ExpenseListPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="payroll"
                element={
                  <ProtectedRoute anyPermission={['payroll.read', 'payroll.read_self']}>
                    <PayrollDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="payroll/periods" element={<Navigate to="/payroll" replace />} />
              <Route
                path="payroll/periods/:id"
                element={
                  <ProtectedRoute permission="payroll.read">
                    <PeriodDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payroll/config"
                element={
                  <ProtectedRoute permission="payroll.config">
                    <PayrollConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payroll/compensations"
                element={
                  <ProtectedRoute permission="payroll.compensation.read">
                    <CompensationListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payroll/shifts/approval"
                element={
                  <ProtectedRoute permission="shift.approve">
                    <ShiftApprovalInbox />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-payroll"
                element={
                  <ProtectedRoute permission="payroll.read_self">
                    <MyPayrollHistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-payroll/preview"
                element={
                  <ProtectedRoute permission="payroll.read_self">
                    <MyPayrollPreviewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-payroll/history"
                element={
                  <ProtectedRoute permission="payroll.read_self">
                    <MyPayrollHistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-payroll/payslip/:periodId"
                element={
                  <ProtectedRoute permission="payroll.read_self">
                    <MyPayslipPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-payroll/compensation"
                element={
                  <ProtectedRoute permission="payroll.read_self">
                    <MyCompensationPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="my-shifts"
                element={
                  <ProtectedRoute permission="shift.read_self">
                    <MyShiftsSelfPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="shifts/pending"
                element={
                  <ProtectedRoute permission="shift.approve">
                    <ShiftApprovalInbox />
                  </ProtectedRoute>
                }
              />

              <Route
                path="reports"
                element={
                  <ProtectedRoute permission="report.read">
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="admin/users"
                element={
                  <ProtectedRoute permission="user.read">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/roles"
                element={
                  <ProtectedRoute permission="role.read">
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/audit"
                element={
                  <ProtectedRoute permission="audit.read">
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/settings"
                element={
                  <ProtectedRoute permission="settings.read">
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/shifts/pending"
                element={
                  <ProtectedRoute permission="shift.approve">
                    <ShiftApprovalInbox />
                  </ProtectedRoute>
                }
              />

              <Route path="/__brand-preview" element={<BrandPreviewPage />} />

              <Route path="403" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </SessionBoot>
    </BrowserRouter>
  );
}
