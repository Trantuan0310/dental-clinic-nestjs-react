// Inventory API surface used by the MedicalRecords module to populate
// the "Vật tư sử dụng" picker in the Treatment editor.

import { useQuery } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

export interface InventoryItemListItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  minStockLevel: number;
  isActive: boolean;
}

// GET /inventory/items returns the raw InventoryItem Prisma row —
// Decimal fields (quantityOnHand/minStockLevel/costPrice) serialize as
// strings, status is the ItemStatus enum ('ACTIVE'|'DISCONTINUED'), and
// there is no reservedQuantity/availableQuantity/reorderPoint/isLowStock
// concept anywhere in this schema.
interface RawInventoryItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantityOnHand: string | number;
  minStockLevel: string | number;
  status: 'ACTIVE' | 'DISCONTINUED';
}

function mapInventoryItem(raw: RawInventoryItem): InventoryItemListItem {
  return {
    id: raw.id,
    sku: raw.sku,
    name: raw.name,
    unit: raw.unit,
    quantityOnHand: Number(raw.quantityOnHand),
    minStockLevel: Number(raw.minStockLevel),
    isActive: raw.status === 'ACTIVE',
  };
}

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

interface UseInventoryParams {
  q?: string;
}

/**
 * Fetch active inventory items so the Treatment form can pick consumables.
 *
 * `unwrap()` already strips the `{ data: ... }` envelope, so the resolved
 * value here is the bare RawInventoryItem[] the backend actually sends —
 * not another `{ data: [...] }` or `{ items: [...] }` wrapper (regression:
 * this used to look for `.items`/`.data` on an already-unwrapped array,
 * which have neither, so it silently resolved to an empty list every time
 * — the picker always rendered with zero options and no error).
 * ListInventoryQueryDto has no `isActive`/`pageSize` field (the global
 * whitelist ValidationPipe silently drops unknown query params), so
 * "active only" has to be the real `status` filter, and pageSize isn't a
 * real request param — the service always caps at 200 server-side.
 */
export function useInventoryItems(params: UseInventoryParams = {}) {
  return useQuery({
    queryKey: ['inventory', 'items', params],
    queryFn: () =>
      get<RawInventoryItem[]>('/inventory/items', {
        params: { status: 'ACTIVE', q: params.q },
      }),
    select: (resp) => ({ items: resp.map(mapInventoryItem) }),
  });
}
