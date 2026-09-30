import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { TimeBlock } from '@/types/schedule';

/** Editable list of "from – to" blocks of one day. */
export function TimeBlocksEditor({
  blocks,
  onChange,
  startLabel = 'Từ',
  max = 6,
}: {
  blocks: TimeBlock[];
  onChange: (blocks: TimeBlock[]) => void;
  startLabel?: string;
  max?: number;
}) {
  const update = (i: number, patch: Partial<TimeBlock>) =>
    onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label={i === 0 ? startLabel : undefined}
              aria-label={`${startLabel} (khung ${i + 1})`}
              type="time"
              step={300}
              required
              value={b.startTime}
              onChange={(e) => update(i, { startTime: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <Input
              label={i === 0 ? 'Đến' : undefined}
              aria-label={`Đến (khung ${i + 1})`}
              type="time"
              step={300}
              required
              value={b.endTime}
              onChange={(e) => update(i, { endTime: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Bỏ khung ${i + 1}`}
            disabled={blocks.length <= 1}
            onClick={() => onChange(blocks.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {blocks.length < max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const last = blocks[blocks.length - 1];
            const start = last ? last.endTime : '08:00';
            onChange([...blocks, { startTime: start, endTime: start < '23:00' ? `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}${start.slice(2)}` : '23:59' }]);
          }}
        >
          <Plus className="h-4 w-4" /> Thêm khung giờ
        </Button>
      )}
    </div>
  );
}
