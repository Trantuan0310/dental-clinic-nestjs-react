import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DentistReviewsService, maskReviewer, REVIEW_WINDOW_DAYS } from './dentist-reviews.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../common/guards/permissions.guard';

const NOW = new Date('2026-11-27T03:00:00Z');
const DAY = 86_400_000;

function setup() {
  const db = {
    encounter: { findFirst: jest.fn() },
    dentistReview: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };
  const service = new DentistReviewsService(
    db as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { db, audit, service };
}
const admin = {
  sub: 'admin',
  email: 'admin@clinic.local',
  permissions: ['dentist.update'],
} as unknown as JwtPayload;

describe('DentistReviewsService', () => {
  it('masks the reviewer to the first letter of the given name', () => {
    expect(maskReviewer('Nguyễn Văn Sơn')).toBe('S***');
    expect(maskReviewer('an')).toBe('A***');
    expect(maskReviewer('  ')).toBe('***');
  });

  it('lets a patient review their own closed visit once, within the window', async () => {
    const { db, audit, service } = setup();
    db.encounter.findFirst.mockResolvedValue({
      id: 'e1',
      dentistId: 'd1',
      closedAt: new Date(NOW.getTime() - 3 * DAY),
    });
    db.dentistReview.create.mockResolvedValue({ id: 'r1', rating: 5, comment: 'Tốt' });
    await expect(service.createForPatient('p1', 'e1', 5, '  Tốt ', NOW)).resolves.toMatchObject({
      rating: 5,
    });
    // Only the patient's own completed visit is looked up.
    expect(db.encounter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'e1', patientId: 'p1', status: 'COMPLETED' } }),
    );
    expect(db.dentistReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dentistId: 'd1', patientId: 'p1', encounterId: 'e1', rating: 5, comment: 'Tốt' },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DENTIST_REVIEW_CREATED' }),
    );
  });

  it('refuses another patient’s visit, an old visit, bad stars and a second review', async () => {
    const { db, service } = setup();
    db.encounter.findFirst.mockResolvedValueOnce(null);
    await expect(service.createForPatient('p2', 'e1', 5, undefined, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    db.encounter.findFirst.mockResolvedValue({
      id: 'e1',
      dentistId: 'd1',
      closedAt: new Date(NOW.getTime() - (REVIEW_WINDOW_DAYS + 1) * DAY),
    });
    await expect(service.createForPatient('p1', 'e1', 5, undefined, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    db.encounter.findFirst.mockResolvedValue({ id: 'e1', dentistId: 'd1', closedAt: NOW });
    await expect(service.createForPatient('p1', 'e1', 6, undefined, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.createForPatient('p1', 'e1', 0, undefined, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    db.dentistReview.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(service.createForPatient('p1', 'e1', 4, undefined, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('hides a review only with a reason, and shows it again', async () => {
    const { db, audit, service } = setup();
    db.dentistReview.findFirst.mockResolvedValue({ id: 'r1', dentistId: 'd1' });
    await expect(service.setStatus('d1', 'r1', 'HIDDEN', 'abc', admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.setStatus('d1', 'r1', 'HIDDEN', 'Có số điện thoại', admin);
    expect(db.dentistReview.update).toHaveBeenLastCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        status: 'HIDDEN',
        hiddenReason: 'Có số điện thoại',
        hiddenBy: 'admin',
      }),
    });
    await service.setStatus('d1', 'r1', 'PUBLISHED', undefined, admin);
    expect(db.dentistReview.update).toHaveBeenLastCalledWith({
      where: { id: 'r1' },
      data: { status: 'PUBLISHED', hiddenReason: null, hiddenBy: null, hiddenAt: null },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DENTIST_REVIEW_HIDDEN' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DENTIST_REVIEW_SHOWN' }),
    );
  });

  it('does not touch a review of another dentist', async () => {
    const { db, service } = setup();
    db.dentistReview.findFirst.mockResolvedValue(null);
    await expect(
      service.setStatus('d2', 'r1', 'HIDDEN', 'Lý do đủ dài', admin),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.dentistReview.findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', dentistId: 'd2' },
    });
  });

  it('averages only published reviews, one decimal, and reports dentists with none', async () => {
    const { db, service } = setup();
    db.dentistReview.groupBy.mockResolvedValue([
      { dentistId: 'd1', _avg: { rating: 4.6666 }, _count: { _all: 3 } },
    ]);
    const out = await service.summaries(['d1', 'd2']);
    expect(db.dentistReview.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dentistId: { in: ['d1', 'd2'] }, status: 'PUBLISHED' } }),
    );
    expect(out.get('d1')).toEqual({ average: 4.7, count: 3 });
    expect(out.get('d2')).toEqual({ average: null, count: 0 });
  });
});
