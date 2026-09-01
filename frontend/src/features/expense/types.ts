// Expense Module Types

export type ExpenseStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
export type ExpenseType = 'OPERATING' | 'INVESTMENT' | 'OTHER';

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string | null;
  type: ExpenseType;
  isActive: boolean;
}

export interface Expense {
  id: string;
  code: string;
  amount: number;
  description: string;
  expenseDate: string;
  status: ExpenseStatus;
  category?: ExpenseCategory | null;
  notes?: string | null;
  receiptUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  creatorName?: string;
  version: number;
}

export interface ExpenseListResponse {
  data: Expense[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateExpensePayload {
  amount: number;
  description: string;
  expenseDate: string;
  categoryId?: string;
  notes?: string;
  receiptUrl?: string;
}

export interface UpdateExpensePayload {
  amount?: number;
  description?: string;
  expenseDate?: string;
  categoryId?: string;
  notes?: string;
  receiptUrl?: string;
}

export interface ExpenseFilters {
  status?: ExpenseStatus | 'all';
  categoryId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
