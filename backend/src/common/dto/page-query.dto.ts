import { z } from 'zod';
import { PaginationSchema } from './pagination.dto';

/**
 * PageQueryDto — page/pageSize based pagination used by admin & finance
 * endpoints that need an exact total (cursor pagination cannot give a count
 * without a second query). Compatible with the existing cursor-based
 * PaginationDto — controllers can pick the right one per use case.
 */
export const PageQuerySchema = PaginationSchema.extend({
  page: z.number().int().positive().default(1).optional(),
  pageSize: z.number().int().positive().max(200).default(20).optional(),
  sort: z.string().optional(),
  search: z.string().max(200).optional(),
});

export type PageQueryDto = z.infer<typeof PageQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
}

export const createPageResponse = <T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
): PageResult<T> => ({
  data,
  meta: {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  },
});

/**
 * Standard list response envelope. Controllers that need a total count
 * (admin tables, payroll lines, finance reports) should wrap their result
 * with `okPage(result, query)`. Cursor-based endpoints keep using
 * `wrapAsPaginated` from pagination.dto.
 */
export const okPage = async <T>(
  fetcher: (skip: number, take: number) => Promise<{ items: T[]; total: number }>,
  query: PageQueryDto,
): Promise<PageResult<T>> => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const skip = (page - 1) * pageSize;
  const { items, total } = await fetcher(skip, pageSize);
  return createPageResponse(items, page, pageSize, total);
};
