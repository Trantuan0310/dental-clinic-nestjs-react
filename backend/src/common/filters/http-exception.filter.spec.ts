import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { BusinessRuleException } from '../exceptions/business-rule.exception';
import {
  CheckInExpiredException,
  SlotConflictException,
} from '../../appointments/domain/exceptions';

/** The `code` the frontend branches on (issue #8: it used to be "Bad Request"). */
function codeOf(exception: unknown): Record<string, unknown> {
  let body: Record<string, unknown> = {};
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn((b: Record<string, unknown>) => (body = b)),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ url: '/x' }) }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0] as number, ...body };
}

describe('HttpExceptionFilter codes', () => {
  it.each<[string, unknown, number, string]>([
    [
      'domain code beside a reason phrase',
      new CheckInExpiredException('late'),
      400,
      'CHECK_IN_EXPIRED',
    ],
    ['slot conflict', new SlotConflictException(), 409, 'SLOT_CONFLICT'],
    [
      'business rule code',
      new BusinessRuleException('busy', HttpStatus.CONFLICT, undefined, 'QUEUE_DENTIST_BUSY'),
      409,
      'QUEUE_DENTIST_BUSY',
    ],
    [
      'validation error falls back to the status code',
      new BadRequestException(['x must be a string']),
      400,
      'BAD_REQUEST',
    ],
    ['plain Nest not found', new NotFoundException(), 404, 'NOT_FOUND'],
    ['unexpected error', new Error('boom'), 500, 'INTERNAL_ERROR'],
  ])('%s', (_name, exception, status, code) => {
    expect(codeOf(exception)).toMatchObject({ status, code });
  });

  it('keeps details (e.g. the forced check-in actions)', () => {
    const body = codeOf(new CheckInExpiredException('late', [{ code: 'no_show', label: 'x' }]));
    expect(body.details).toEqual({ actions: [{ code: 'no_show', label: 'x' }] });
  });
});
