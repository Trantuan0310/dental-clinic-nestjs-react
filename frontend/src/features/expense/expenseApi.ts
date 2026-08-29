import { api, unwrap } from '@/lib/api';
import type {
  Expense,
  ExpenseCategory,
  ExpenseListResponse,
  CreateExpensePayload,
  UpdateExpensePayload,
  ExpenseFilters,
} from './types';

export const expenseApi = {
  // Categories
  async listCategories(): Promise<ExpenseCategory[]> {
    const { data } = await api.get<{ data: ExpenseCategory[] }>('/expenses/categories');
    return data.data;
  },

  // Expenses
  async list(params?: ExpenseFilters): Promise<ExpenseListResponse> {
    const { data } = await api.get<ExpenseListResponse>('/expenses', { params });
    return data;
  },

  async get(id: string): Promise<Expense> {
    const { data } = await api.get<{ data: Expense }>(`/expenses/${id}`);
    return unwrap(data);
  },

  async create(payload: CreateExpensePayload): Promise<Expense> {
    const { data } = await api.post<{ data: Expense }>('/expenses', payload);
    return unwrap(data);
  },

  async update(id: string, payload: UpdateExpensePayload): Promise<Expense> {
    const { data } = await api.put<{ data: Expense }>(`/expenses/${id}`, payload);
    return unwrap(data);
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/expenses/${id}`);
  },

  async approve(id: string, notes?: string): Promise<Expense> {
    const { data } = await api.post<{ data: Expense }>(`/expenses/${id}/approve`, { notes });
    return unwrap(data);
  },

  async reject(id: string, reason: string): Promise<Expense> {
    const { data } = await api.post<{ data: Expense }>(`/expenses/${id}/reject`, { reason });
    return unwrap(data);
  },

  async markReimbursed(id: string, notes?: string): Promise<Expense> {
    const { data } = await api.post<{ data: Expense }>(`/expenses/${id}/reimburse`, { notes });
    return unwrap(data);
  },
};
