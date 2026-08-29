import {
  UserStatus,
  Gender,
  IdentifierType,
  AppointmentStatus,
  EncounterStatus,
  InvoiceStatus,
  PaymentMethod,
  PayrollPeriodStatus,
  PayrollCycle,
  PaymentStatus,
  ItemStatus,
  MovementType,
  ShiftRegistrationStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

/**
 * Fixture factories mirror real Prisma row structure (PROJECT_RULES.md §13 R2-8).
 * Each factory returns a frozen object that can be spread or used directly.
 */

const FIXED_DATE = new Date('2026-08-15T10:00:00.000Z');

const ACTION_AUDIT = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_DONE: 'PASSWORD_RESET_DONE',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  USER_CREATED: 'USER_CREATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_PASSWORD_RESET_BY_ADMIN: 'USER_PASSWORD_RESET_BY_ADMIN',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_PERMISSIONS_CHANGED: 'ROLE_PERMISSIONS_CHANGED',
  LOGOUT_ALL: 'LOGOUT_ALL',
} as const;
export { ACTION_AUDIT };

export const validUser = (overrides: Partial<any> = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$saltsalt$hashhash',
  fullName: 'Test User',
  status: UserStatus.ACTIVE,
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  deactivatedAt: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: null,
  updatedBy: null,
  deletedAt: null,
  userRoles: [],
  ...overrides,
});

export const validDentistUser = (overrides: Partial<any> = {}) =>
  validUser({
    id: 'dentist-1',
    email: 'dentist@clinic.com',
    fullName: 'Dr. Smith',
    ...overrides,
  });

export const validAdminUser = (overrides: Partial<any> = {}) =>
  validUser({
    id: 'admin-1',
    email: 'admin@clinic.com',
    fullName: 'Admin',
    ...overrides,
  });

export const validRole = (overrides: Partial<any> = {}) => ({
  id: 'role-1',
  code: 'admin',
  name: 'admin',
  description: 'Administrator',
  isSystem: false,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  ...overrides,
});

export const validPermission = (overrides: Partial<any> = {}) => ({
  id: 'perm-1',
  code: 'patient.read',
  description: 'Read patient',
  createdAt: FIXED_DATE,
  ...overrides,
});

export const validUserRole = (overrides: Partial<any> = {}) => ({
  userId: 'user-1',
  roleId: 'role-1',
  assignedAt: FIXED_DATE,
  assignedBy: null,
  role: validRole(),
  ...overrides,
});

export const validRefreshToken = (overrides: Partial<any> = {}) => ({
  id: 'rt-1',
  userId: 'user-1',
  tokenHash: 'tokenhash',
  expiresAt: new Date('2026-08-22T10:00:00.000Z'),
  revokedAt: null,
  replacedByTokenId: null,
  createdAt: FIXED_DATE,
  user: validUser({ id: 'user-1' }),
  ...overrides,
});

export const validPasswordResetToken = (overrides: Partial<any> = {}) => ({
  id: 'prt-1',
  userId: 'user-1',
  tokenHash: 'resethash',
  expiresAt: new Date('2026-08-15T11:00:00.000Z'),
  usedAt: null,
  createdAt: FIXED_DATE,
  ...overrides,
});

export const validLoginHistoryItem = (overrides: Partial<any> = {}) => ({
  id: 'lh-1',
  userId: 'user-1',
  action: ACTION_AUDIT.LOGIN_SUCCESS,
  occurredAt: FIXED_DATE,
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  metadata: null,
  ...overrides,
});

export const validPatient = (overrides: Partial<any> = {}) => ({
  id: 'patient-1',
  fullName: 'Nguyen Van A',
  dob: new Date('1990-01-15'),
  gender: Gender.MALE,
  addressLine: '123 Le Loi',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh',
  phoneNumbers: ['0901234567'],
  email: 'patient@example.com',
  allergies: [],
  medicalHistoryNotes: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'user-1',
  updatedBy: null,
  deletedAt: null,
  ...overrides,
});

export const validPatientIdentifier = (overrides: Partial<any> = {}) => ({
  id: 'ident-1',
  patientId: 'patient-1',
  type: IdentifierType.CCCD,
  value: '079123456789',
  issuedAt: null,
  expiresAt: null,
  notes: null,
  createdAt: FIXED_DATE,
  createdBy: 'user-1',
  ...overrides,
});

export const validPhoneHistory = (overrides: Partial<any> = {}) => ({
  id: 'ph-1',
  patientId: 'patient-1',
  phoneNumber: '0901234567',
  changedAt: FIXED_DATE,
  changedBy: 'user-1',
  ...overrides,
});

export const validAppointment = (overrides: Partial<any> = {}) => ({
  id: 'appt-1',
  patientId: 'patient-1',
  dentistId: 'dentist-1',
  startAt: new Date('2026-08-20T09:00:00.000Z'),
  endAt: new Date('2026-08-20T09:30:00.000Z'),
  status: AppointmentStatus.SCHEDULED,
  reason: 'Checkup',
  notes: null,
  source: 'PHONE',
  cancelReason: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelledReason: null,
  confirmedAt: null,
  confirmedBy: null,
  checkedInAt: null,
  checkedInBy: null,
  noShowAt: null,
  rescheduleCount: 0,
  lastRescheduleAt: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'user-1',
  updatedBy: null,
  deletedAt: null,
  ...overrides,
});

export const validEncounter = (overrides: Partial<any> = {}) => ({
  id: 'enc-1',
  appointmentId: 'appt-1',
  patientId: 'patient-1',
  dentistId: 'dentist-1',
  status: EncounterStatus.IN_PROGRESS,
  startedAt: FIXED_DATE,
  closedAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  ...overrides,
});

export const validClinicalNote = (overrides: Partial<any> = {}) => ({
  id: 'cn-1',
  encounterId: 'enc-1',
  chiefComplaint: null,
  diagnosis: null,
  treatmentPlan: null,
  notes: null,
  isLocked: false,
  lockedAt: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'dentist-1',
  updatedBy: null,
  ...overrides,
});

export const validClinicalNoteAddendum = (overrides: Partial<any> = {}) => ({
  id: 'add-1',
  clinicalNoteId: 'cn-1',
  content: 'Late entry.',
  createdAt: FIXED_DATE,
  createdBy: 'dentist-1',
  ...overrides,
});

export const validTreatment = (overrides: Partial<any> = {}) => ({
  id: 'tr-1',
  encounterId: 'enc-1',
  toothNumber: 11,
  procedureCode: 'D1110',
  description: 'Cleaning',
  status: 'PLANNED',
  fee: new Prisma.Decimal(500_000),
  quantity: 1,
  notes: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'dentist-1',
  updatedBy: null,
  deletedAt: null,
  ...overrides,
});

export const validPrescription = (overrides: Partial<any> = {}) => ({
  id: 'rx-1',
  encounterId: 'enc-1',
  medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: '3x/day', duration: '7 days' }],
  notes: null,
  createdAt: FIXED_DATE,
  createdBy: 'dentist-1',
  ...overrides,
});

export const validDentalChartSnapshot = (overrides: Partial<any> = {}) => ({
  id: 'dc-1',
  patientId: 'patient-1',
  encounterId: 'enc-1',
  kind: 'PERMANENT',
  data: { teeth: {} },
  snapshotAt: FIXED_DATE,
  createdBy: 'dentist-1',
  ...overrides,
});

export const validInvoice = (overrides: Partial<any> = {}) => ({
  id: 'inv-1',
  code: 'INV-2026-000001',
  encounterId: 'enc-1',
  patientId: 'patient-1',
  status: InvoiceStatus.DRAFT,
  subtotal: new Prisma.Decimal(500_000),
  discountType: null,
  discountValue: null,
  total: new Prisma.Decimal(500_000),
  paidAmount: new Prisma.Decimal(0),
  outstandingAmount: new Prisma.Decimal(500_000),
  notes: null,
  issuedAt: null,
  issuedBy: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'user-1',
  version: 0,
  deletedAt: null,
  ...overrides,
});

export const validInvoiceItem = (overrides: Partial<any> = {}) => ({
  id: 'ii-1',
  invoiceId: 'inv-1',
  treatmentId: 'tr-1',
  kind: 'TREATMENT',
  description: 'Cleaning',
  quantity: 1,
  unitPrice: new Prisma.Decimal(500_000),
  amount: new Prisma.Decimal(500_000),
  createdAt: FIXED_DATE,
  ...overrides,
});

export const validPayment = (overrides: Partial<any> = {}) => ({
  id: 'pay-1',
  invoiceId: 'inv-1',
  amount: new Prisma.Decimal(200_000),
  method: PaymentMethod.CASH,
  reference: null,
  receivedAt: FIXED_DATE,
  receivedBy: 'user-1',
  notes: null,
  status: PaymentStatus.COMPLETED,
  ...overrides,
});

export const validInvoiceAudit = (overrides: Partial<any> = {}) => ({
  id: 'ia-1',
  invoiceId: 'inv-1',
  action: 'INVOICE_CREATED',
  actorUserId: 'user-1',
  occurredAt: FIXED_DATE,
  metadata: null,
  ...overrides,
});

export const validInventoryItem = (overrides: Partial<any> = {}) => ({
  id: 'item-1',
  sku: 'SKU-001',
  categoryId: 'cat-1',
  name: 'Gloves',
  description: null,
  quantityOnHand: new Prisma.Decimal(100),
  minStockLevel: new Prisma.Decimal(20),
  unit: 'box',
  costPrice: new Prisma.Decimal(50_000),
  status: ItemStatus.ACTIVE,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'user-1',
  deletedAt: null,
  ...overrides,
});

export const validInventoryCategory = (overrides: Partial<any> = {}) => ({
  id: 'cat-1',
  name: 'Consumables',
  description: null,
  createdAt: FIXED_DATE,
  ...overrides,
});

export const validStockMovement = (overrides: Partial<any> = {}) => ({
  id: 'mv-1',
  itemId: 'item-1',
  type: MovementType.STOCK_IN,
  quantity: new Prisma.Decimal(10),
  reason: 'Restock',
  reference: null,
  occurredAt: FIXED_DATE,
  performedBy: 'user-1',
  ...overrides,
});

export const validPayrollConfig = (overrides: Partial<any> = {}) => ({
  id: 'config-1',
  payrollCycle: PayrollCycle.MONTHLY,
  overtimeMultiplier: new Prisma.Decimal(1.5),
  defaultTaxTncnPct: new Prisma.Decimal(0.1),
  bhxhPct: new Prisma.Decimal(0.08),
  bhytPct: new Prisma.Decimal(0.015),
  bhtnPct: new Prisma.Decimal(0.01),
  minGrossForBhxh: new Prisma.Decimal(4_680_000),
  probationSalaryPct: new Prisma.Decimal(0.85),
  taxBrackets: [],
  updatedByUserId: null,
  updatedAt: FIXED_DATE,
  ...overrides,
});

export const validCompensation = (overrides: Partial<any> = {}) => ({
  id: 'comp-1',
  dentistId: 'dentist-1',
  baseSalary: new Prisma.Decimal(10_000_000),
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  reason: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'admin-1',
  deletedAt: null,
  ...overrides,
});

export const validPayrollPeriod = (overrides: Partial<any> = {}) => ({
  id: 'period-1',
  periodStart: new Date('2026-08-01'),
  periodEnd: new Date('2026-08-31'),
  payrollCycle: PayrollCycle.MONTHLY,
  status: PayrollPeriodStatus.DRAFT,
  createdByUserId: 'user-1',
  createdAt: FIXED_DATE,
  lockedByUserId: null,
  lockedAt: null,
  approvedByUserId: null,
  approvedAt: null,
  markedPaidByUserId: null,
  paidAt: null,
  paymentReference: null,
  lockedImmutableAt: null,
  ...overrides,
});

export const validPayrollLineItem = (overrides: Partial<any> = {}) => ({
  id: 'pli-1',
  periodId: 'period-1',
  dentistId: 'dentist-1',
  baseSalary: new Prisma.Decimal(10_000_000),
  overtimeAmount: new Prisma.Decimal(0),
  bonus: new Prisma.Decimal(0),
  deduction: new Prisma.Decimal(0),
  taxAmount: new Prisma.Decimal(0),
  bhxhAmount: new Prisma.Decimal(0),
  bhytAmount: new Prisma.Decimal(0),
  bhtnAmount: new Prisma.Decimal(0),
  netPay: new Prisma.Decimal(10_000_000),
  ...overrides,
});

export const validShiftRegistration = (overrides: Partial<any> = {}) => ({
  id: 'sr-1',
  dentistId: 'dentist-1',
  date: new Date('2026-08-20'),
  startTime: '09:00',
  endTime: '12:00',
  status: ShiftRegistrationStatus.PENDING,
  notes: null,
  approvedBy: null,
  approvedAt: null,
  rejectReason: null,
  createdAt: FIXED_DATE,
  ...overrides,
});

export const validWorkingSchedule = (overrides: Partial<any> = {}) => ({
  id: 'ws-1',
  dentistId: 'dentist-1',
  dayOfWeek: 1,
  startTime: '00:00',
  endTime: '23:59',
  slotDurationMin: 30,
  validFrom: new Date('2026-01-01'),
  validTo: null,
  isPaidShift: true,
  shiftType: 'FULL_DAY',
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  createdBy: 'admin-1',
  deletedAt: null,
  ...overrides,
});

export const validTimeOff = (overrides: Partial<any> = {}) => ({
  id: 'to-1',
  dentistId: 'dentist-1',
  startDate: new Date('2026-08-25'),
  endDate: new Date('2026-08-26'),
  reason: 'Vacation',
  createdAt: FIXED_DATE,
  ...overrides,
});

export const validAuditLog = (overrides: Partial<any> = {}) => ({
  id: 'audit-1',
  actorUserId: 'user-1',
  action: 'TEST_ACTION',
  targetType: 'Patient',
  targetId: 'patient-1',
  occurredAt: FIXED_DATE,
  metadata: null,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

export { FIXED_DATE };
