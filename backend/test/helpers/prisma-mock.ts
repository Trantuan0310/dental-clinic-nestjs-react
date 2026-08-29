/**
 * Type-safe Prisma mock factory.
 * Tạo object mock Prisma với tất cả method được wrap bằng jest.fn().
 * Caller tùy chỉnh mockResolvedValue/mockReturnValue cho từng test case.
 *
 * Theo PROJECT_RULES.md §13 R2-8: mock data phải mirror cấu trúc row thật.
 * Theo PROJECT_RULES.md §13 R2-10: $transaction mock phải nhận callback.
 */

type AnyFn = jest.Mock;

export interface PrismaMockShape {
  $transaction: AnyFn;
  $executeRaw: AnyFn;
  $executeRawUnsafe: AnyFn;
  $queryRaw: AnyFn;
  $queryRawUnsafe: AnyFn;
  $connect: AnyFn;
  $disconnect: AnyFn;
  user: Record<string, AnyFn>;
  passwordResetToken: Record<string, AnyFn>;
  refreshToken: Record<string, AnyFn>;
  auditLog: Record<string, AnyFn>;
  patient: Record<string, AnyFn>;
  patientIdentifier: Record<string, AnyFn>;
  patientPhoneHistory: Record<string, AnyFn>;
  patientMergeLog: Record<string, AnyFn>;
  appointment: Record<string, AnyFn>;
  appointmentRescheduleLog: Record<string, AnyFn>;
  encounter: Record<string, AnyFn>;
  encounterAudit: Record<string, AnyFn>;
  clinicalNote: Record<string, AnyFn>;
  clinicalNoteAddendum: Record<string, AnyFn>;
  prescription: Record<string, AnyFn>;
  treatment: Record<string, AnyFn>;
  treatmentInventoryUsage: Record<string, AnyFn>;
  inventoryUsage: Record<string, AnyFn>;
  dentalChart: Record<string, AnyFn>;
  invoice: Record<string, AnyFn>;
  invoiceAudit: Record<string, AnyFn>;
  invoiceItem: Record<string, AnyFn>;
  payment: Record<string, AnyFn>;
  inventoryItem: Record<string, AnyFn>;
  inventoryCategory: Record<string, AnyFn>;
  stockMovement: Record<string, AnyFn>;
  payrollConfig: Record<string, AnyFn>;
  payrollPeriod: Record<string, AnyFn>;
  payrollLineItem: Record<string, AnyFn>;
  payrollEncounterDetail: Record<string, AnyFn>;
  dentistCompensation: Record<string, AnyFn>;
  payrollAdjustment: Record<string, AnyFn>;
  workingSchedule: Record<string, AnyFn>;
  timeOff: Record<string, AnyFn>;
  shiftRegistration: Record<string, AnyFn>;
  role: Record<string, AnyFn>;
  permission: Record<string, AnyFn>;
  userRole: Record<string, AnyFn>;
  rolePermission: Record<string, AnyFn>;
  [model: string]: any;
}

const CRUD_METHODS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
];

const buildModel = (): Record<string, AnyFn> => {
  const m: Record<string, AnyFn> = {};
  for (const method of CRUD_METHODS) {
    m[method] = jest.fn();
  }
  return m;
};

/**
 * Create a deep prisma mock with all standard model methods stubbed as jest.fn().
 * Default behavior: every method returns undefined. Tests override with mockResolvedValue/etc.
 *
 * @param overrides — explicit model mocks to attach (e.g. { user: { findUnique: jest.fn(...) } })
 */
export const createPrismaMock = (overrides: Record<string, any> = {}): PrismaMockShape => {
  const baseTx = {
    $executeRaw: jest.fn(async () => 0),
    $executeRawUnsafe: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => []),
    $queryRawUnsafe: jest.fn(async () => []),
  };

  const mock: PrismaMockShape = {
    $transaction: jest.fn(async (cb: any) => (typeof cb === 'function' ? cb(baseTx) : cb)),
    $executeRaw: jest.fn(async () => 0),
    $executeRawUnsafe: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => []),
    $queryRawUnsafe: jest.fn(async () => []),
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined),

    user: buildModel(),
    passwordResetToken: buildModel(),
    refreshToken: buildModel(),
    auditLog: buildModel(),
    patient: buildModel(),
    patientIdentifier: buildModel(),
    patientPhoneHistory: buildModel(),
    patientMergeLog: buildModel(),
    appointment: buildModel(),
    appointmentRescheduleLog: buildModel(),
    encounter: buildModel(),
    encounterAudit: buildModel(),
    clinicalNote: buildModel(),
    clinicalNoteAddendum: buildModel(),
    prescription: buildModel(),
    prescriptionLine: buildModel(),
    treatment: buildModel(),
    treatmentInventoryUsage: buildModel(),
    inventoryUsage: buildModel(),
    dentalChart: buildModel(),
    invoice: buildModel(),
    invoiceAudit: buildModel(),
    invoiceItem: buildModel(),
    payment: buildModel(),
    inventoryItem: buildModel(),
    inventoryCategory: buildModel(),
    stockMovement: buildModel(),
    payrollConfig: buildModel(),
    payrollPeriod: buildModel(),
    payrollLineItem: buildModel(),
    payrollEncounterDetail: buildModel(),
    dentistCompensation: buildModel(),
    payrollAdjustment: buildModel(),
    workingSchedule: buildModel(),
    timeOff: buildModel(),
    shiftRegistration: buildModel(),
    role: buildModel(),
    permission: buildModel(),
    userRole: buildModel(),
    rolePermission: buildModel(),

    ...overrides,
  };

  return mock;
};

/**
 * Re-wire $transaction to invoke callback with the supplied client (default: same mock).
 * Use this when the service uses `prisma.$transaction(async tx => ...)`.
 */
export const asTransaction = (mock: PrismaMockShape, tx: any = mock): void => {
  (mock.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
    typeof cb === 'function' ? cb(tx) : cb,
  );
};
