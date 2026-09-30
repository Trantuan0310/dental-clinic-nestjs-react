import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
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

describe('HttpExceptionFilter — input errors that used to be 500s', () => {
  const known = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: '5.22.0', meta });
  const bodyParser = (status: number, type: string) =>
    Object.assign(new Error(type), { status, statusCode: status, type });

  it.each<[string, unknown, number, string]>([
    ['P2000 value too long', known('P2000'), 400, 'BAD_REQUEST'],
    ['P2003 foreign key', known('P2003'), 400, 'BAD_REQUEST'],
    ['raw 22003 numeric overflow', known('P2010', { code: '22003' }), 400, 'BAD_REQUEST'],
    [
      'NUL byte (22021)',
      new Prisma.PrismaClientUnknownRequestError(
        'invalid byte sequence for encoding "UTF8": 0x00 (code 22021)',
        { clientVersion: '5.22.0' },
      ),
      400,
      'BAD_REQUEST',
    ],
    ['413 body too large', bodyParser(413, 'entity.too.large'), 413, 'PAYLOAD_TOO_LARGE'],
    ['400 malformed JSON', bodyParser(400, 'entity.parse.failed'), 400, 'BAD_REQUEST'],
    ['other Prisma errors stay 500', known('P2025'), 500, 'INTERNAL_ERROR'],
    [
      'an unrelated "out of range" driver error stays 500',
      new Prisma.PrismaClientUnknownRequestError('index out of range', {
        clientVersion: '5.22.0',
      }),
      500,
      'INTERNAL_ERROR',
    ],
  ])('%s', (_name, exception, status, code) => {
    const body = codeOf(exception);
    expect(body).toMatchObject({ status, code });
    if (status < 500) expect(String(body.message)).toMatch(/Dữ liệu/);
  });

  it('429 from the throttler gets a code and a Vietnamese message', () => {
    expect(codeOf(new ThrottlerException())).toMatchObject({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
    });
  });
});
