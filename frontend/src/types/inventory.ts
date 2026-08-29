// =============================================================================
// Inventory Module TypeScript Types
// Source: backend API + docs/04_Database/schema-per-module/inventory.md
// =============================================================================

export type InventoryCategory = 'medication' | 'material' | 'instrument' | 'implant' | 'other';

// `MovementType` from Prisma enum (`backend/prisma/schema.prisma`):
//   STOCK_IN | STOCK_OUT | ADJUSTMENT
// `MovementRefType` adds the cross-module ENCOUNTER ref kind. Legacy lowercase
// values are still accepted by `MovementRefType` for backward-compat with older
// callers (the backend never emits them — they come from the wire guard).
export type StockMovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'ADJUSTMENT'
  | 'ENCOUNTER_REF'
  | 'WRITE_OFF'
  | 'TRANSFER'
  | 'EXPIRED'
  | 'INITIAL'
  | 'RETURNED'
  | 'DAMAGED';

/** Vietnamese display label for a stock-movement type. */
export const STOCK_MOVEMENT_TYPE_LABEL: Record<StockMovementType, string> = {
  STOCK_IN: 'Nhập kho',
  STOCK_OUT: 'Xuất kho',
  ADJUSTMENT: 'Kiểm kê',
  ENCOUNTER_REF: 'Sử dụng trong điều trị',
  WRITE_OFF: 'Xuất hủy',
  TRANSFER: 'Chuyển kho',
  EXPIRED: 'Hết hạn',
  INITIAL: 'Tồn ban đầu',
  RETURNED: 'Khách trả',
  DAMAGED: 'Hư hỏng',
};

export function stockMovementLabel(type: string): string {
  return STOCK_MOVEMENT_TYPE_LABEL[type as StockMovementType] ?? type;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  unit: string;
  currentQuantity: number;
  minStockLevel: number;
  maxStockLevel?: number;
  costPrice: number;
  sellingPrice: number;
  supplier?: string | null;
  description?: string | null;
  status: 'ACTIVE' | 'DISCONTINUED';
  createdAt: string;
  updatedAt?: string;
}

export interface InventoryItemListResponse {
  data: InventoryItem[];
  total: number;
}

export interface InventoryFilters {
  q?: string;
  categoryId?: string;
  status?: 'ACTIVE' | 'DISCONTINUED';
  lowStockOnly?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  performedByUserId: string;
  performedByUserName: string;
  createdAt: string;
}

export interface StockMovementListResponse {
  data: StockMovement[];
  total: number;
}

// BR-INV-004: Adjustment is an absolute set of `quantityOnHand`.
// The client sends the target value as `newQuantity`. An optional `reason`
// is recorded in the stock movement audit trail.
export interface StockAdjustmentPayload {
  newQuantity: number;
  reason?: string;
}

// API functions
import { api, unwrap } from '@/lib/api';

export interface InventoryCategoryOption {
  id: string;
  name: string;
}

export const inventoryApi = {
  async list(params?: InventoryFilters): Promise<InventoryItemListResponse> {
    const { data } = await api.get<InventoryItemListResponse>('/inventory/items', { params });
    return data;
  },

  async get(id: string): Promise<InventoryItem> {
    const { data } = await api.get<{ data: InventoryItem }>(`/inventory/items/${id}`);
    return unwrap(data);
  },

  async create(payload: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> {
    const { data } = await api.post<{ data: InventoryItem }>('/inventory/items', payload);
    return unwrap(data);
  },

  async update(id: string, payload: Partial<InventoryItem>): Promise<InventoryItem> {
    const { data } = await api.patch<{ data: InventoryItem }>(`/inventory/items/${id}`, payload);
    return unwrap(data);
  },

  async adjust(id: string, payload: StockAdjustmentPayload): Promise<InventoryItem> {
    const { data } = await api.post<{ data: InventoryItem }>(`/inventory/items/${id}/adjust`, payload);
    return unwrap(data);
  },

  async listMovements(params?: {
    itemId?: string;
    type?: StockMovementType;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<StockMovementListResponse> {
    const { data } = await api.get<StockMovementListResponse>('/inventory/movements', { params });
    return data;
  },

  async listCategories(): Promise<InventoryCategoryOption[]> {
    const { data } = await api.get<{ data: InventoryCategoryOption[] }>('/inventory/categories');
    return data.data;
  },

  async getLowStockAlerts(): Promise<InventoryItem[]> {
    const { data } = await api.get<{ data: InventoryItem[] }>('/inventory/items/low-stock');
    return unwrap(data);
  },
};
