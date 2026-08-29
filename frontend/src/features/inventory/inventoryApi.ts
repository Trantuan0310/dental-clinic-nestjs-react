// Inventory API surface used by the MedicalRecords module to populate
// the "Vật tư sử dụng" picker in the Treatment editor. Aligns with
// `docs/05_API/inventory.md`.

import { useQuery } from '@tanstack/react-query';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';

export interface InventoryItemListItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderPoint: number;
  isLowStock: boolean;
  isActive: boolean;
}

interface ListEnvelope<T> {
  data: T[];
}

const get = async <T>(url: string, config?: Parameters<typeof api.get>[1]) => {
  const { data } = await api.get<AuthEnvelope<T>>(url, config);
  return unwrap(data);
};

interface UseInventoryParams {
  active?: boolean;
  q?: string;
  pageSize?: number;
}

/**
 * Fetch active inventory items so the Treatment form can pick consumables.
 *
 * The backend returns either `{ data: Item[] }` (cursor list) or
 * `{ data: { items: Item[], ... } }` — we normalize to the array form.
 */
export function useInventoryItems(params: UseInventoryParams = {}) {
  return useQuery({
    queryKey: ['inventory', 'items', params],
    queryFn: () =>
      get<ListEnvelope<InventoryItemListItem> | { items: InventoryItemListItem[] }>('/inventory/items', {
        params: { isActive: params.active ?? true, pageSize: params.pageSize ?? 200, q: params.q },
      }),
    select: (resp) => {
      const raw = (resp as { items?: InventoryItemListItem[] }).items ?? (resp as { data?: InventoryItemListItem[] }).data ?? [];
      return { items: raw };
    },
  });
}
