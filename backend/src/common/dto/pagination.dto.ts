import { z } from 'zod';

export const PaginationSchema = z.object({
  pageSize: z.number().int().positive().default(20).optional(),
  cursor: z.string().optional(),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    pageSize: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export const createPaginatedResponse = <T>(
  data: T[],
  pageSize: number,
  hasMore: boolean,
  nextCursor?: string | null,
): PaginatedResult<T> => ({
  data,
  pagination: {
    pageSize,
    nextCursor: nextCursor ?? null,
    hasMore,
  },
});

interface PaginatedInput<T> {
  data?: T[];
}

export const wrapAsPaginated = <T>(
  input: T[] | PaginatedResult<T> | PaginatedInput<T> | null | undefined,
  pageSize: number = 20,
): PaginatedResult<T> => {
  if (input == null) return createPaginatedResponse([], pageSize, false, null);
  if (Array.isArray(input)) return createPaginatedResponse(input, pageSize, false, null);
  if ('data' in input && 'pagination' in input) return input as PaginatedResult<T>;
  if ('data' in input && Array.isArray((input as PaginatedInput<T>).data)) {
    return createPaginatedResponse((input as PaginatedInput<T>).data ?? [], pageSize, false, null);
  }
  const arr = input as unknown as T[];
  if (arr && typeof arr === 'object') {
    const maybeData = (arr as { data?: T[] }).data;
    if (Array.isArray(maybeData)) {
      return createPaginatedResponse(maybeData, pageSize, false, null);
    }
  }
  return createPaginatedResponse([], pageSize, false, null);
};
