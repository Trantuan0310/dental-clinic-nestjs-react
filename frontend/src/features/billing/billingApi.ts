// Billing imperative API — invoices, payments, and revenue reports.
// No hook variants exist yet; consumers call these directly from
// mutationFn / queryFn. Located under features/billing/ as the
// canonical home (the legacy `src/api/billing.ts` was a re-export).

import { api, unwrap } from '@/lib/api';
import type {
  Invoice,
  InvoiceListResponse,
  InvoiceFilters,
  CreateInvoicePayload,
  CreateAdhocInvoicePayload,
  Payment,
  PaymentListResponse,
  PaymentFilters,
  CreatePaymentPayload,
  RevenueReport,
  RevenueByDayEntry,
  RevenueReportByProcedureEntry,
  RevenueReportBySourceEntry,
  OutstandingAgingEntry,
} from '@/types/billing';

const BASE = '/billing';

export const billingApi = {
  // Invoices
  async listInvoices(params?: InvoiceFilters): Promise<InvoiceListResponse> {
    const { data } = await api.get<InvoiceListResponse>(`${BASE}/invoices`, { params });
    return data;
  },

  async getInvoice(id: string): Promise<Invoice> {
    const { data } = await api.get<{ data: Invoice }>(`${BASE}/invoices/${id}`);
    return unwrap(data);
  },

  async createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
    const { data } = await api.post<{ data: Invoice }>(`${BASE}/invoices`, payload);
    return unwrap(data);
  },

  // No `/billing/invoices/adhoc` endpoint exists in the current backend.
  // Ad-hoc invoices must be created via `createInvoice` (linked to an
  // encounter) or the legacy `/invoices/adhoc` route handled elsewhere.
  async createAdhocInvoice(payload: CreateAdhocInvoicePayload): Promise<Invoice> {
    throw new Error(
      `createAdhocInvoice is not implemented in the backend (payload=${JSON.stringify(payload)}). Use createInvoice linked to an encounter.`,
    );
  },

  async issueInvoice(id: string, version: number): Promise<Invoice> {
    const { data } = await api.post<{ data: Invoice }>(`${BASE}/invoices/${id}/issue`, { version });
    return unwrap(data);
  },

  async voidInvoice(id: string, reason: string, version: number): Promise<Invoice> {
    const { data } = await api.post<{ data: Invoice }>(`${BASE}/invoices/${id}/void`, { reason, version });
    return unwrap(data);
  },

  // Payments live under an invoice, not at a top-level `/payments` path.
  async listPayments(invoiceId: string, _params?: PaymentFilters): Promise<PaymentListResponse> {
    // Backend exposes a payments array on each invoice response; the
    // dedicated list endpoint is not part of the public API. Fetch the
    // invoice and project its payments list.
    const { data } = await api.get<{ data: Invoice }>(`${BASE}/invoices/${invoiceId}`);
    const inv = unwrap(data);
    return { data: inv.payments ?? [], total: (inv.payments ?? []).length };
  },

  async createPayment(invoiceId: string, payload: Omit<CreatePaymentPayload, 'invoiceId'>): Promise<Payment> {
    const { data } = await api.post<{ data: Payment }>(`${BASE}/invoices/${invoiceId}/payments`, payload);
    return unwrap(data);
  },

  // Reversing a payment is not currently exposed by the controller.
  async reversePayment(_invoiceId: string, _paymentId: string, _reason: string): Promise<Payment> {
    throw new Error('reversePayment endpoint is not implemented in the backend.');
  },

  // Reports
  async getRevenueReport(params: { from: string; to: string; dentistId?: string }): Promise<RevenueReport> {
    const { data } = await api.get<{ data: RevenueReport }>(`${BASE}/reports/revenue`, { params });
    return unwrap(data);
  },

  async getRevenueByDay(params: { from?: string; to?: string }): Promise<RevenueByDayEntry[]> {
    const { data } = await api.get<{ data: RevenueByDayEntry[] }>(`${BASE}/reports/revenue-by-day`, { params });
    return data.data;
  },

  async getRevenueByMonth(): Promise<{ month: string; revenue: number }[]> {
    const { data } = await api.get<{ data: { month: string; revenue: number }[] }>(`${BASE}/reports/revenue-by-month`);
    return data.data;
  },

  async getRevenueByProcedure(params: { from?: string; to?: string }): Promise<RevenueReportByProcedureEntry[]> {
    const { data } = await api.get<{ data: RevenueReportByProcedureEntry[] }>(`${BASE}/reports/revenue-by-procedure`, { params });
    return data.data;
  },

  async getRevenueBySource(params: { from?: string; to?: string }): Promise<RevenueReportBySourceEntry[]> {
    const { data } = await api.get<{ data: RevenueReportBySourceEntry[] }>(`${BASE}/reports/revenue-by-source`, { params });
    return data.data;
  },

  async getOutstandingReport(daysOutstanding?: number): Promise<{ data: OutstandingAgingEntry[]; pagination: unknown }> {
    const { data } = await api.get<{ data: OutstandingAgingEntry[]; pagination: unknown }>(`${BASE}/reports/outstanding`, {
      params: { daysOutstanding },
    });
    return data;
  },

  async getOutstandingSummary(): Promise<{ totalDebt: number; invoiceCount: number }> {
    const { data } = await api.get<{ totalDebt: number; invoiceCount: number }>(`${BASE}/reports/outstanding-summary`);
    return data;
  },
};