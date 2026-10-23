import { isValidFdiToothNumber } from '@/types/medical-records';
import type { PlanItemInput, TreatmentPlanItem } from './treatmentPlansApi';

/** One editable line; numbers stay strings while the user types. */
export interface DraftLine {
  key: string;
  serviceId: string;
  procedure: string;
  teeth: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

let seq = 0;
export const emptyLine = (): DraftLine => ({
  key: `line-${++seq}`,
  serviceId: '',
  procedure: '',
  teeth: '',
  quantity: '1',
  unitPrice: '',
  notes: '',
});

export const lineFromItem = (item: TreatmentPlanItem): DraftLine => ({
  key: item.id,
  serviceId: item.serviceId ?? '',
  procedure: item.procedure,
  teeth: item.toothNumbers.join(', '),
  quantity: String(item.quantity),
  unitPrice: String(item.unitPrice),
  notes: item.notes ?? '',
});

const parseTeeth = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const lineTotal = (line: DraftLine) => (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);

export const draftTotal = (lines: DraftLine[]) => lines.reduce((sum, l) => sum + lineTotal(l), 0);

/**
 * Turns the draft lines into the API payload, or returns the first problem
 * as a message (mirrors the backend DTO: procedure ≥ 2 chars, whole-đồng
 * price, quantity 1–100, FDI tooth numbers).
 */
export function linesToPayload(
  lines: DraftLine[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): { items: PlanItemInput[] } | { error: string } {
  if (!lines.length) return { error: t('uiPlans.emptyLines') };
  const items: PlanItemInput[] = [];
  for (const [index, line] of lines.entries()) {
    const price = Number(line.unitPrice);
    const quantity = Number(line.quantity || '1');
    if (
      line.procedure.trim().length < 2 ||
      line.unitPrice === '' ||
      !Number.isInteger(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return { error: t('uiPlans.lineIncomplete', { n: index + 1 }) };
    }
    const teeth = parseTeeth(line.teeth);
    const bad = teeth.filter((s) => !/^\d+$/.test(s) || !isValidFdiToothNumber(Number(s)));
    if (bad.length) return { error: t('uiPlans.invalidTeeth', { teeth: bad.join(', ') }) };
    items.push({
      ...(line.serviceId && { serviceId: line.serviceId }),
      procedure: line.procedure.trim(),
      toothNumbers: teeth.map(Number),
      quantity,
      unitPrice: price,
      ...(line.notes.trim() && { notes: line.notes.trim() }),
    });
  }
  return { items };
}
