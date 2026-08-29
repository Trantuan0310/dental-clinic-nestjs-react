// =============================================================================
// Medical Records Module TypeScript Types
// Source: backend API + docs/03_Specification/MedicalRecords/SPEC.md
// =============================================================================

export type EncounterStatus = 'in_progress' | 'completed' | 'cancelled';
export type NoteType = 'chief_complaint' | 'diagnosis' | 'progress_note' | 'other';
export type ToothSurface =
  | 'normal'
  | 'caries'
  | 'filling'
  | 'missing'
  | 'fractured'
  | 'crown'
  | 'implant'
  | 'root_canal';

// ----- Patient snapshot -----
export interface PatientAllergy {
  substance: string;
  reaction?: string;
  severity?: 'mild' | 'moderate' | 'severe';
}

export interface PatientSummary {
  id: string;
  code: string;
  fullName: string;
  allergies?: PatientAllergy[];
}

export interface DentistSummary {
  id: string;
  fullName: string;
}

// ----- Clinical Note -----
export interface ClinicalNote {
  id: string;
  encounterId: string;
  type: NoteType;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  treatmentPlan?: string | null;
  notes?: string | null;
  // Legacy aliases kept for backward-compat with older UI code.
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  rawNotes?: string | null;
  content?: string;
  createdAt: string;
  updatedAt?: string;
  createdByUserId: string;
  createdByUserName: string;
}

// ----- Treatment lines -----
export interface TreatmentInventoryUsage {
  inventoryItemId: string;
  inventoryItemName?: string;
  quantityUsed: number;
}

export interface TreatmentLine {
  id: string;
  encounterId: string;
  toothNumber: number | string;
  treatmentCode: string;
  treatmentName: string;
  description?: string | null;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
  inventoryItemsUsed?: TreatmentInventoryUsage[];
  createdAt: string;
  // ---- Legacy aliases (kept for backward-compat with older UI code) ----
  procedureCode?: string;
  procedureName?: string;
  unitPrice?: number;
  total?: number;
  notes?: string | null;
}

// ----- Prescription -----
export interface PrescriptionWarning {
  type: 'allergy' | 'interaction';
  severity: 'low' | 'medium' | 'high';
  message: string;
  lineIndex?: number;
}

export interface PrescriptionLine {
  id?: string;
  drugName: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  quantity?: number;
  instructions?: string | null;
  isAllergyWarning?: boolean;
  // ---- Legacy aliases (kept for backward-compat with older UI code) ----
  medicationName?: string;
  duration?: string;
}

// Legacy name kept for older UI code paths.
export type PrescriptionItem = PrescriptionLine;

export interface Prescription {
  id: string;
  encounterId: string;
  diagnosis?: string | null;
  note?: string | null;
  /** Backend now persists this separately from `note`. */
  instructions?: string | null;
  followUpNote?: string | null;
  /** Free-form notes (legacy alias for `note`). */
  notes?: string | null;
  issuedAt?: string;
  prescribedAt?: string;
  prescribedByUserId?: string;
  prescribedByUserName?: string;
  items?: PrescriptionLine[];
  lines?: PrescriptionLine[];
  warnings?: PrescriptionWarning[];
}

// ----- Encounter -----
export interface Encounter {
  id: string;
  code: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  patient?: PatientSummary;
  dentistId: string;
  dentistName: string;
  dentist?: DentistSummary;
  appointmentId?: string | null;
  status: EncounterStatus;
  startedAt: string;
  completedAt?: string | null;
  closedAt?: string | null;
  diagnosis?: string | null;
  chiefComplaint?: string | null;
  summary?: string | null;
  createdAt: string;
  updatedAt?: string;
  notes?: ClinicalNote[];
  clinicalNote?: ClinicalNote;
  treatments?: TreatmentLine[];
  prescriptions?: Prescription[];
  dentalChart?: DentalChart;
}

export interface EncounterSummary {
  id: string;
  code: string;
  patientId: string;
  patientName: string;
  dentistId: string;
  dentistName: string;
  startedAt: string;
  completedAt?: string | null;
  closedAt?: string | null;
  status: EncounterStatus;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  summary?: string | null;
}

// ----- Encounter list (lightweight) -----
export interface EncounterListItem {
  id: string;
  code: string;
  patientId: string;
  patientName: string;
  dentistId: string;
  dentistName: string;
  startedAt: string;
  status: EncounterStatus;
  chiefComplaint?: string | null;
}

// ----- Dental chart -----
export interface DentalChart {
  encounterId: string;
  teeth: ToothRecord[];
  snapshotAt: string;
  capturedAt?: string;
}

export interface ToothRecord {
  number: string;
  surface: ToothSurface;
  notes?: string | null;
  treatments?: string[];
}

// ----- Tooth chart primitives (FDI) -----
export type ToothArch = 'upper' | 'lower';
export type ToothSide = 'left' | 'right';

export type ToothQuadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface ToothDescriptor {
  number: number;
  fdi: string;
  name: string;
  arch: ToothArch;
  side: ToothSide;
  quadrant: ToothQuadrant;
}

// Source of truth for status palette used by the new picker (DentalChartPanel).
// Keep aligned with backend DTO allow-list and SPEC §5.1 (subset).
export type ToothStatus =
  | 'healthy'
  | 'cavity'
  | 'filled'
  | 'crowned'
  | 'missing'
  | 'implant'
  | 'extraction_needed';

export const TOOTH_STATUSES: ToothStatus[] = [
  'healthy',
  'cavity',
  'filled',
  'crowned',
  'missing',
  'implant',
  'extraction_needed',
];

export interface ToothEntry {
  status: ToothStatus;
  notes?: string;
}

// Wire payload expected by PUT /encounters/:id/dental-chart (matches backend DTO).
// Keep field order stable; backend ignores extra keys.
export interface DentalChartPutPayload {
  patientType: 'ADULT' | 'CHILD';
  teeth: Array<{ number: number; surface: string; notes?: string | null }>;
}

export const TOOTH_STATUS_LABEL: Record<ToothStatus, string> = {
  healthy: 'Bình thường',
  cavity: 'Sâu răng',
  filled: 'Đã hàn',
  crowned: 'Bọc mão',
  missing: 'Đã nhổ',
  implant: 'Implant',
  extraction_needed: 'Cần nhổ',
};

export const TOOTH_STATUS_SEMANTIC: Record<ToothStatus, 'healthy' | 'attention' | 'severe'> = {
  healthy: 'healthy',
  cavity: 'attention',
  filled: 'attention',
  crowned: 'attention',
  missing: 'severe',
  implant: 'severe',
  extraction_needed: 'severe',
};

export function toothStatusColor(status: ToothStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case 'healthy':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'cavity':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'filled':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'crowned':
      return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
    case 'missing':
      return { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' };
    case 'implant':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'extraction_needed':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' };
  }
}

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

function makeTooth(
  number: number,
  arch: ToothArch,
  side: ToothSide,
  quadrant: ToothQuadrant,
  name: string,
): ToothDescriptor {
  return { number, fdi: String(number), name, arch, side, quadrant };
}

export const ADULT_TEETH: ToothDescriptor[] = [
  ...UPPER_RIGHT.map((n) => makeTooth(n, 'upper', 'right', 'Q1', `Răng ${n}`)),
  ...UPPER_LEFT.map((n) => makeTooth(n, 'upper', 'left', 'Q2', `Răng ${n}`)),
  ...LOWER_LEFT.map((n) => makeTooth(n, 'lower', 'left', 'Q3', `Răng ${n}`)),
  ...LOWER_RIGHT.map((n) => makeTooth(n, 'lower', 'right', 'Q4', `Răng ${n}`)),
];

export function toothQuadrantOf(number: number): ToothQuadrant {
  if (number >= 11 && number <= 18) return 'Q1';
  if (number >= 21 && number <= 28) return 'Q2';
  if (number >= 31 && number <= 38) return 'Q3';
  if (number >= 41 && number <= 48) return 'Q4';
  throw new Error(`Tooth ${number} is not a valid permanent FDI number`);
}

// ----- Addendums -----
export interface ClinicalNoteAddendum {
  id: string;
  encounterId: string;
  text: string;
  reason?: string | null;
  authorUserId: string;
  authorName?: string;
  addedAt: string;
  createdAt: string;
}

// ----- Dental chart snapshot -----
// Shape returned by GET /encounters/:id/dental-chart.
// The picker keeps an in-memory map keyed by FDI number for O(1) updates and
// converts it to/from the wire payload via the adapter helpers below.
export interface DentalChartSnapshotTeethEntry {
  status: ToothStatus;
  notes?: string;
}

export interface DentalChartSnapshot {
  id?: string;
  encounterId: string;
  patientType?: 'ADULT' | 'CHILD';
  teeth: Record<string, DentalChartSnapshotTeethEntry | { status?: ToothStatus; notes?: string }>;
  capturedAt?: string;
  snapshotAt?: string;
}

// Adapter: snapshot ↔ wire payload (ToothRecord[]).
// Backend expects at most 32 records, one per FDI tooth.
export function snapshotToWire(
  teeth: Record<string, ToothEntry>,
  patientType: 'ADULT' | 'CHILD',
): DentalChartPutPayload {
  const wire: DentalChartPutPayload['teeth'] = [];
  for (const t of ADULT_TEETH) {
    const fdi = String(t.number);
    const entry = teeth[fdi];
    if (!entry) continue;
    wire.push({
      number: t.number,
      surface: entry.status,
      notes: entry.notes?.trim() ? entry.notes : null,
    });
  }
  return { patientType, teeth: wire };
}

export function wireToSnapshotMap(
  records: ReadonlyArray<{ number?: number | string; surface?: string; status?: string; notes?: string | null }>,
): Record<string, ToothEntry> {
  const map: Record<string, ToothEntry> = {};
  for (const t of ADULT_TEETH) {
    map[String(t.number)] = { status: 'healthy', notes: '' };
  }
  for (const r of records ?? []) {
    const n = typeof r.number === 'string' ? Number(r.number) : r.number;
    if (typeof n !== 'number' || Number.isNaN(n)) continue;
    const status = (r.status ?? r.surface ?? 'healthy') as ToothStatus;
    map[String(n)] = {
      status: TOOTH_STATUSES.includes(status) ? status : 'healthy',
      notes: r.notes ?? '',
    };
  }
  return map;
}

// ----- Treatment catalog -----
export interface TreatmentCatalogEntry {
  code: string;
  name: string;
  description?: string;
  priceCents: number;
  durationMinutes?: number;
}

export const TREATMENT_CATALOG: TreatmentCatalogEntry[] = [
  { code: 'EXAM_CONSULT', name: 'Khám / Tư vấn', description: 'Khám tổng quát và tư vấn điều trị', priceCents: 200000 },
  { code: 'CLEAN_SIMPLE', name: 'Lấy cao răng đơn giản', description: 'Lấy cao răng thông thường', priceCents: 500000 },
  { code: 'CLEAN_DEEP', name: 'Lấy cao răng sâu', description: 'Lấy cao răng dưới nướu, làm sạch túi nha chu', priceCents: 1200000 },
  { code: 'FILL_COMPOSITE', name: 'Hàn Composite', description: 'Hàn răng bằng vật liệu Composite thẩm mỹ', priceCents: 600000 },
  { code: 'FILL_GIC', name: 'Hàn GIC', description: 'Hàn răng bằng GIC (phù hợp răng sữa / cổ răng)', priceCents: 400000 },
  { code: 'ROOT_CANAL_ANT', name: 'Chữa tủy răng cửa', description: 'Nội nha răng cửa / răng nanh', priceCents: 2500000 },
  { code: 'ROOT_CANAL_MOLAR', name: 'Chữa tủy răng hàm', description: 'Nội nha răng cối nhỏ hoặc lớn', priceCents: 4000000 },
  { code: 'CROWN_PFM', name: 'Mão PFM', description: 'Mão sứ kim loại', priceCents: 3500000 },
  { code: 'CROWN_ZIRCONIA', name: 'Mão Zirconia', description: 'Mão toàn sứ Zirconia', priceCents: 6500000 },
  { code: 'CROWN_E_MAX', name: 'Mão E-Max', description: 'Mão sứ E.Max thẩm mỹ cao', priceCents: 7500000 },
  { code: 'EXTRACTION_SIMPLE', name: 'Nhổ răng đơn giản', description: 'Nhổ răng thường, không phẫu thuật', priceCents: 500000 },
  { code: 'EXTRACTION_SURGICAL', name: 'Nhổ răng phẫu thuật', description: 'Nhổ răng khó, răng khôn mọc lệch', priceCents: 2500000 },
  { code: 'IMPLANT', name: 'Cấy Implant', description: 'Cấy ghép Implant (chưa bao gồm mão)', priceCents: 25000000 },
  { code: 'WHITENING', name: 'Tẩy trắng răng', description: 'Tẩy trắng tại phòng khám', priceCents: 5000000 },
  { code: 'XRAY_PERIAPICAL', name: 'X-quang quanh chóp', description: 'Phim X-quang quanh chóp (1 phim)', priceCents: 100000 },
  { code: 'XRAY_PANORAMIC', name: 'X-quang Panorama', description: 'Phim X-quang toàn cảnh', priceCents: 300000 },
];

// ----- API Payloads -----
export interface CreateEncounterPayload {
  appointmentId?: string;
  patientId: string;
  chiefComplaint?: string;
}

export interface CreateNotePayload {
  encounterId: string;
  type: NoteType;
  content: string;
}

export interface CreateTreatmentPayload {
  encounterId: string;
  toothNumber: number | string;
  treatmentCode: string;
  treatmentName?: string;
  description?: string;
  priceCents: number;
  quantity: number;
  inventoryItemId?: string;
  inventoryItemsUsed?: TreatmentInventoryUsage[];
  notes?: string;
}

export interface UpdateTreatmentPayload {
  description?: string;
  priceCents?: number;
  quantity?: number;
  inventoryItemsUsed?: TreatmentInventoryUsage[];
}

export interface CreatePrescriptionPayload {
  encounterId: string;
  diagnosis?: string;
  instructions?: string;
  followUpNote?: string;
  note?: string;
  /** Wire alias for legacy FE code that used `notes`. */
  notes?: string;
  items: Omit<PrescriptionLine, 'id'>[];
}

/**
 * Wire payload for PATCH /medical-records/prescriptions/:id.
 * All fields are partial — only the ones sent will be persisted.
 */
export interface UpdatePrescriptionPayload {
  diagnosis?: string | null;
  instructions?: string | null;
  followUpNote?: string | null;
  notes?: string | null;
}

export interface EncounterClosePayload {
  diagnosis?: string;
  finalNotes?: string;
}

export interface EncounterCloseSideEffects {
  invoiceDraftId?: string | null;
  stockMovementsCreated: number;
}

export interface EncounterCloseResult {
  encounter: Encounter;
  sideEffects: EncounterCloseSideEffects;
}

export interface UpdateDentalChartPayload {
  encounterId: string;
  teeth: ToothRecord[];
}

// Re-export commonly used names for ergonomics
export type Treatment = TreatmentLine;
export type TreatmentLineShape = TreatmentLine;
export { TOOTH_STATUS_LABEL as DEFAULT_TOOTH_STATUS_LABEL };
