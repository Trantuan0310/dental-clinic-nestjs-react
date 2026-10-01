// =============================================================================
// Billing Module TypeScript Types
// Source: backend API + docs/03_Specification/Billing/SPEC.md
// =============================================================================

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'VOIDED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';

export interface InvoiceLineItem {
  id: string;
  sequence: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  paidAt: string;
  receivedByUser?: { fullName: string; email: string } | null;
}

export interface Invoice {
  id: string;
  code: string;
  patientId: string;
  // Flattened server-side from the `patient` relation (see
  // billing.service.ts formatInvoice()) — not present on the raw Prisma row.
  patientCode: string;
  patientName: string;
  status: InvoiceStatus;
  subtotal: number;
  discountType?: 'PERCENT' | 'AMOUNT' | null;
  discountValue?: number | null;
  total: number;
  paidAmount: number;
  outstandingAmount: number;
  version: number;
  items?: InvoiceLineItem[];
  payments?: Payment[];
  notes?: string | null;
  voidReason?: string | null;
  issuedAt?: string | null;
  voidedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface InvoiceListResponse {
  data: Invoice[];
  pagination: {
    pageSize: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  summary: {
    invoiceCount: number;
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
  };
}

export interface InvoiceFilters {
  q?: string;
  // Backend accepts an array (`?status=ISSUED&status=PARTIAL`) so a caller
  // can ask for e.g. "unpaid" (ISSUED + PARTIAL) in one request.
  status?: InvoiceStatus[] | 'all';
  patientId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface CreateInvoicePayload {
  patientId: string;
  encounterId?: string;
  lineItems: Omit<InvoiceLineItem, 'id' | 'sequence' | 'lineTotal'>[];
  discount?: number;
  notes?: string;
}

export interface CreateAdhocInvoicePayload {
  patientId: string;
  description: string;
  amount: number;
  notes?: string;
}

export interface PaymentListResponse {
  data: Payment[];
  total: number;
}

export interface PaymentFilters {
  invoiceId?: string;
  patientId?: string;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CreatePaymentPayload {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}

export interface RevenueReportByMonthEntry {
  month: string;
  total: number;
  paid: number;
  count: number;
}

export interface RevenueReportByDentistEntry {
  dentistId: string;
  dentistName: string;
  revenue: number;
  /** Collected on this dentist's invoices in the range (by payment date). */
  paid: number;
  count: number;
  sharePct: number;
}

export interface RevenueReportByPaymentMethodEntry {
  method: PaymentMethod;
  /** Net of refunds. */
  amount: number;
  count: number;
  sharePct: number;
}

export interface RevenueReportByStatusEntry {
  status: string;
  count: number;
  total: number;
  outstanding: number;
}

export interface RevenueReportByServiceEntry {
  service: string;
  total: number;
  count: number;
}

/**
 * Revenue = issued invoices (ISSUED/PARTIAL/PAID) by issue date; collected =
 * payments by payment date net of refunds. DRAFT/VOIDED only in `excluded`.
 */
export interface RevenueReport {
  from: string;
  to: string;
  dentistId: string | null;
  totalInvoiced: number;
  totalCollected: number;
  totalRefunded: number;
  totalOutstanding: number;
  invoiceCount: number;
  byStatus: RevenueReportByStatusEntry[];
  excluded: {
    draft: { count: number; total: number };
    voided: { count: number; total: number };
  };
  byMonth: RevenueReportByMonthEntry[];
  byDentist: RevenueReportByDentistEntry[];
  byService: RevenueReportByServiceEntry[];
  byPaymentMethod: RevenueReportByPaymentMethodEntry[];
}

export interface RevenueByDayEntry {
  date: string;
  revenue: number;
  invoiceCount: number;
}

export interface RevenueReportDailyEntry {
  date: string;
  revenue: number;
  count: number;
}

export interface RevenueReportByProcedureEntry {
  procedure: string;
  revenue: number;
  count: number;
}

export interface RevenueReportBySourceEntry {
  source: string;
  sourceLabel: string;
  revenue: number;
  percentage: number;
  count: number;
}

export type OutstandingBucket = 'D0_7' | 'D8_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

export interface OutstandingAgingEntry {
  id: string;
  code: string;
  patient: {
    id: string;
    fullName: string;
    code: string;
    phone: string | null;
  };
  /** Start of the visit the invoice is for. */
  visitDate: string | null;
  dentistName: string | null;
  total: number;
  outstanding: number;
  issuedAt: string;
  /** Whole clinic days since issue. */
  daysOld: number;
  bucket: OutstandingBucket;
  bucketLabel: string;
}
