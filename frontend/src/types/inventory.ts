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

// Raw Prisma `InventoryItem` row (see backend inventory.service.ts /
// prisma/schema.prisma) — column names differ from this file's InventoryItem
// type (sku vs code, quantityOnHand vs currentQuantity), and Decimal columns
// serialize as strings over the wire.
interface PrismaInventoryItemRow {
  id: string;
  sku: string;
  name: string;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  unit: string;
  quantityOnHand: number | string;
  minStockLevel: number | string;
  costPrice?: number | string | null;
  description?: string | null;
  status: 'ACTIVE' | 'DISCONTINUED';
  createdAt: string;
  updatedAt?: string;
}

function mapInventoryItem(raw: PrismaInventoryItemRow): InventoryItem {
  return {
    id: raw.id,
    code: raw.sku,
    name: raw.name,
    categoryId: raw.categoryId,
    category: raw.category,
    unit: raw.unit,
    currentQuantity: Number(raw.quantityOnHand),
    minStockLevel: Number(raw.minStockLevel),
    // No selling-price concept on the backend — items are consumed by
    // treatments, not sold directly — so this is always unset.
    costPrice: Number(raw.costPrice ?? 0),
    sellingPrice: 0,
    description: raw.description,
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

interface PrismaStockMovementRow {
  id: string;
  inventoryItemId: string;
  inventoryItem?: { id: string; sku: string; name: string; unit: string } | null;
  type: StockMovementType;
  refType?: string | null;
  refId?: string | null;
  diff: number | string;
  quantityAfter: number | string;
  reason?: string | null;
  performedBy?: string | null;
  performedByUser?: { id: string; fullName: string } | null;
  performedAt: string;
}

function mapStockMovement(raw: PrismaStockMovementRow): StockMovement {
  return {
    id: raw.id,
    itemId: raw.inventoryItemId,
    itemCode: raw.inventoryItem?.sku ?? '',
    itemName: raw.inventoryItem?.name ?? '',
    type: raw.type,
    quantity: Number(raw.diff),
    balanceAfter: Number(raw.quantityAfter),
    referenceType: raw.refType,
    referenceId: raw.refId,
    reason: raw.reason,
    performedByUserId: raw.performedBy ?? '',
    performedByUserName: raw.performedByUser?.fullName ?? '',
    createdAt: raw.performedAt,
  };
}

// Outbound payload for create/update — only fields the backend DTO
// actually accepts (sku/quantityOnHand, not code/currentQuantity).
interface InventoryItemWritePayload {
  sku?: string;
  categoryId?: string | null;
  name?: string;
  description?: string | null;
  quantityOnHand?: number;
  minStockLevel?: number;
  unit?: string;
  costPrice?: number;
  status?: 'ACTIVE' | 'DISCONTINUED';
}

function toWritePayload(item: Partial<InventoryItem>): InventoryItemWritePayload {
  return {
    ...(item.code !== undefined && { sku: item.code }),
    ...(item.categoryId !== undefined && { categoryId: item.categoryId }),
    ...(item.name !== undefined && { name: item.name }),
    ...(item.description !== undefined && { description: item.description }),
    ...(item.currentQuantity !== undefined && { quantityOnHand: item.currentQuantity }),
    ...(item.minStockLevel !== undefined && { minStockLevel: item.minStockLevel }),
    ...(item.unit !== undefined && { unit: item.unit }),
    ...(item.costPrice !== undefined && { costPrice: item.costPrice }),
    ...(item.status !== undefined && { status: item.status }),
  };
}

export const inventoryApi = {
  async list(params?: InventoryFilters): Promise<InventoryItemListResponse> {
    const { data } = await api.get<{ data: PrismaInventoryItemRow[]; total?: number }>(
      '/inventory/items',
      { params },
    );
    return { data: data.data.map(mapInventoryItem), total: data.total ?? data.data.length };
  },

  async get(id: string): Promise<InventoryItem> {
    const { data } = await api.get<{ data: PrismaInventoryItemRow }>(`/inventory/items/${id}`);
    return mapInventoryItem(unwrap(data));
  },

  async create(payload: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> {
    const { data } = await api.post<{ data: PrismaInventoryItemRow }>(
      '/inventory/items',
      toWritePayload(payload),
    );
    return mapInventoryItem(unwrap(data));
  },

  async update(id: string, payload: Partial<InventoryItem>): Promise<InventoryItem> {
    const { data } = await api.patch<{ data: PrismaInventoryItemRow }>(
      `/inventory/items/${id}`,
      toWritePayload(payload),
    );
    return mapInventoryItem(unwrap(data));
  },

  async adjust(id: string, payload: StockAdjustmentPayload): Promise<InventoryItem> {
    const { data } = await api.post<{ data: PrismaInventoryItemRow }>(
      `/inventory/items/${id}/adjust`,
      payload,
    );
    return mapInventoryItem(unwrap(data));
  },

  async listMovements(params?: {
    itemId?: string;
    type?: StockMovementType;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<StockMovementListResponse> {
    // Backend query param is `inventoryItemId`, not `itemId`.
    const { itemId, ...rest } = params ?? {};
    const { data } = await api.get<{ data: PrismaStockMovementRow[]; total?: number }>(
      '/inventory/movements',
      { params: { ...rest, inventoryItemId: itemId } },
    );
    return { data: data.data.map(mapStockMovement), total: data.total ?? data.data.length };
  },

  async listCategories(): Promise<InventoryCategoryOption[]> {
    const { data } = await api.get<{ data: InventoryCategoryOption[] }>('/inventory/categories');
    return data.data;
  },

  async getLowStockAlerts(): Promise<InventoryItem[]> {
    const { data } = await api.get<{ data: PrismaInventoryItemRow[] }>('/inventory/items/low-stock');
    return unwrap(data).map(mapInventoryItem);
  },
};
