import { z } from 'zod';

export const SummaryQuerySchema = z.object({
  top: z.coerce.number().int().min(1).max(10).default(5),
  refresh: z.coerce.boolean().default(false),
});

export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;
