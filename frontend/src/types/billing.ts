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
  total: number;
}

export interface InvoiceFilters {
  q?: string;
  status?: InvoiceStatus | 'all';
  patientId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
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
  paid: number;
  count: number;
}

export interface RevenueReportByPaymentMethodEntry {
  method: PaymentMethod;
  amount: number;
  count: number;
}

export interface RevenueReportByStatusEntry {
  status: string;
  count: number;
  total: number;
  paid: number;
  outstanding: number;
}

export interface RevenueReport {
  from: string;
  to: string;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  invoiceCount: number;
  byStatus: RevenueReportByStatusEntry[];
  byMonth: RevenueReportByMonthEntry[];
  byDentist: RevenueReportByDentistEntry[];
  byPaymentMethod: RevenueReportByPaymentMethodEntry[];
}

export interface RevenueByDayEntry {
  date: string;
  revenue: number;
  count: number;
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

export interface OutstandingAgingEntry {
  id: string;
  code: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  outstanding: number;
  issuedAt: string;
  daysOld: number;
}
