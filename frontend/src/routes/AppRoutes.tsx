import { lazy, Suspense } from 'react';
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Outlet, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { SessionBoot } from '@/features/auth/SessionBoot';
import { PageLoader } from '@/components/ui/Loading';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ForbiddenPage, NotFoundPage } from '@/features/auth/ErrorPages';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
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
const DispatchPage = lazy(() => import('@/features/dispatch/DispatchPage'));
const MyPatientsPage = lazy(() => import('@/features/medical-records/MyPatientsPage'));
const PatientEncountersPage = lazy(
  () => import('@/features/medical-records/PatientEncountersPage'),
);
const EncounterDetailPage = lazy(
  () => import('@/features/medical-records/EncounterDetailPage'),
);

const InvoiceDetailPage = lazy(() => import('@/features/billing/InvoiceDetailPage'));
const InvoiceListPage = lazy(() => import('@/features/billing/InvoiceListPage'));

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
const MyPayslipPage = lazy(() => import('@/features/payroll/MyPayslipPage'));
const MyPayrollHistoryPage = lazy(
  () => import('@/features/payroll/MyPayrollHistoryPage'),
);

const ShiftApprovalInbox = lazy(() => import('@/features/shift/ShiftApprovalInbox'));
const MyShiftsSelfPage = lazy(() => import('@/features/shift/MyShiftsPage'));
const SchedulePage = lazy(() => import('@/features/schedule/SchedulePage'));

const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const UsersPage = lazy(() => import('@/features/admin/UsersPage'));
const EmployeesPage = lazy(() => import('@/features/staff/EmployeesPage'));
const DentistsPage = lazy(() => import('@/features/staff/DentistsPage'));
const DentistDetailPage = lazy(() => import('@/features/staff/DentistDetailPage'));
const ServicesPage = lazy(() => import('@/features/catalog/ServicesPage'));
const RolesPage = lazy(() => import('@/features/admin/RolesPage'));
const AuditLogsPage = lazy(() => import('@/features/admin/AuditLogsPage'));
const SettingsPage = lazy(() => import('@/features/admin/SettingsPage'));

const BrandPreviewPage = lazy(() => import('@/features/brand/BrandPreviewPage'));

function SuspenseBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<SessionBoot><Suspense fallback={<PageLoader />}><Outlet /></Suspense></SessionBoot>}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

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
                  // Page derives its list from GET /appointments (see
                  // TodayPage.tsx), which the API gates on
                  // appointment.read.any/.own — not encounter.read. The old
                  // guard used encounter.read, a permission receptionist
                  // doesn't hold, blocking a role that otherwise has full
                  // access to the underlying data.
                  <ProtectedRoute permission="appointment.read">
                    <TodayPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dispatch"
                element={
                  <ProtectedRoute permission="queue.manage">
                    <DispatchPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-queue"
                element={
                  // Same mismatch as /today above — data comes from
                  // GET /appointments?status=checked_in, gated on
                  // appointment.read.any/.own, not encounter.read.
                  <ProtectedRoute permission="appointment.read">
                    <MyQueuePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="medical-records"
                element={
                  // PatientEncountersPage always renders around a
                  // :patientId param (usePatientEncounters(patientId),
                  // the "Mã BN: {patientId}" header) - it has no
                  // "no patient selected" state of its own. The sidebar's
                  // "Bệnh án" nav item linked straight to this bare path
                  // (nav.ts), so every dentist/admin who clicked it landed
                  // on a confusing empty page reading "Mã BN: " with
                  // nothing after the colon. Same redirect pattern as
                  // /billing -> /billing/list below: send them to the
                  // patient list, where the real entry points into medical
                  // records (a patient's own "Lịch sử khám" tab, or
                  // /my-patients for a dentist) already work correctly.
                  <ProtectedRoute permission="medical_record.read">
                    <Navigate to="/patients" replace />
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
                  // Page derives its list from `encounter.read.own` (own
                  // encounters' distinct patients) — patient.read let every
                  // role (incl. receptionist, who has no encounters at all)
                  // reach a page that only makes sense for a dentist/admin.
                  <ProtectedRoute permission="encounter.read.own">
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
                    <InvoiceListPage />
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
                  <ProtectedRoute permission="payroll.read.any">
                    <PayrollDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="payroll/periods" element={<Navigate to="/payroll" replace />} />
              <Route
                path="payroll/periods/:id"
                element={
                  <ProtectedRoute permission="payroll.read.any">
                    <PeriodDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payroll/config"
                element={
                  <ProtectedRoute permission="payroll.config.read">
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
                path="schedule"
                element={
                  <ProtectedRoute permission="schedule.read">
                    <SchedulePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="staff"
                element={
                  <ProtectedRoute permission="employee.read">
                    <EmployeesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dentists"
                element={
                  <ProtectedRoute permission="dentist.read">
                    <DentistsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="services"
                element={
                  <ProtectedRoute permission="service.read">
                    <ServicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dentists/:userId"
                element={
                  <ProtectedRoute permission="dentist.read">
                    <DentistDetailPage />
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
  </Route>,
), { future: { v7_relativeSplatPath: true } });

export function AppRoutes() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
