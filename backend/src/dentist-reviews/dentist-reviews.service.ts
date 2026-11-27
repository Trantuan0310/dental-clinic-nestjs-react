import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DentistReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../common/guards/permissions.guard';

/** A visit can be reviewed this long after it closed. */
export const REVIEW_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Nguyễn Văn Sơn" → "S***": enough to tell reviews apart, not to identify anyone. */
export function maskReviewer(fullName: string): string {
  const given = fullName.trim().split(/\s+/).pop() ?? '';
  return given ? `${given[0].toUpperCase()}***` : '***';
}

export type RatingSummary = { average: number | null; count: number };

/**
 * Patients rate the dentist of a closed visit (1–5 stars, optional comment)
 * through their history link, once per visit. Published reviews are shown on
 * the online booking page; staff can hide one (with a reason), and a hidden
 * review is neither shown nor counted.
 */
@Injectable()
export class DentistReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Average (one decimal) and count of published reviews per dentist. */
  async summaries(dentistIds: string[]): Promise<Map<string, RatingSummary>> {
    const out = new Map<string, RatingSummary>();
    if (dentistIds.length === 0) return out;
    const rows = await this.prisma.dentistReview.groupBy({
      by: ['dentistId'],
      where: { dentistId: { in: dentistIds }, status: DentistReviewStatus.PUBLISHED },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const id of dentistIds) out.set(id, { average: null, count: 0 });
    for (const r of rows) {
      out.set(r.dentistId, {
        average: r._avg.rating == null ? null : Math.round(r._avg.rating * 10) / 10,
        count: r._count._all,
      });
    }
    return out;
  }

  /** Newest published reviews of a dentist, with the reviewer masked. */
  async publicList(dentistId: string, take = 20) {
    const [rows, distribution] = await Promise.all([
      this.prisma.dentistReview.findMany({
        where: { dentistId, status: DentistReviewStatus.PUBLISHED },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          patient: { select: { fullName: true } },
          encounter: { select: { treatments: { where: { deletedAt: null }, select: { procedure: true }, take: 1 } } },
        },
      }),
      this.prisma.dentistReview.groupBy({
        by: ['rating'],
        where: { dentistId, status: DentistReviewStatus.PUBLISHED },
        _count: { _all: true },
      }),
    ]);
    return {
      // Stars 5..1 → number of reviews.
      distribution: [5, 4, 3, 2, 1].map(stars => ({
        stars,
        count: distribution.find(d => d.rating === stars)?._count._all ?? 0,
      })),
      reviews: rows.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewer: maskReviewer(r.patient.fullName),
        service: r.encounter.treatments[0]?.procedure ?? null,
      })),
    };
  }

  /** Every review of a dentist for staff, hidden ones included. */
  async listForStaff(dentistId: string) {
    const rows = await this.prisma.dentistReview.findMany({
      where: { dentistId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        rating: true,
        comment: true,
        status: true,
        hiddenReason: true,
        hiddenAt: true,
        createdAt: true,
        encounterId: true,
        patient: { select: { id: true, code: true, fullName: true } },
      },
    });
    return rows;
  }

  async setStatus(
    dentistId: string,
    reviewId: string,
    status: DentistReviewStatus,
    reason: string | undefined,
    actor: JwtPayload,
  ) {
    const review = await this.prisma.dentistReview.findFirst({ where: { id: reviewId, dentistId } });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    const hide = status === DentistReviewStatus.HIDDEN;
    if (hide && (reason?.trim().length ?? 0) < 5) {
      throw new BadRequestException('Ẩn đánh giá cần lý do (ít nhất 5 ký tự)');
    }
    const updated = await this.prisma.dentistReview.update({
      where: { id: reviewId },
      data: hide
        ? { status, hiddenReason: reason!.trim(), hiddenBy: actor.sub, hiddenAt: new Date() }
        : { status, hiddenReason: null, hiddenBy: null, hiddenAt: null },
    });
    await this.audit.log({
      action: hide ? 'DENTIST_REVIEW_HIDDEN' : 'DENTIST_REVIEW_SHOWN',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'dentist_review',
      targetId: reviewId,
      metadata: { dentistId, ...(hide ? { reason: reason!.trim() } : {}) },
    });
    return updated;
  }

  /** Reviews already given for these visits (the patient's history page). */
  async forEncounters(encounterIds: string[]) {
    if (encounterIds.length === 0) return new Map<string, { rating: number; comment: string | null }>();
    const rows = await this.prisma.dentistReview.findMany({
      where: { encounterId: { in: encounterIds } },
      select: { encounterId: true, rating: true, comment: true },
    });
    return new Map(rows.map(r => [r.encounterId, { rating: r.rating, comment: r.comment }]));
  }

  /** Whether a visit closed at `closedAt` can still be reviewed. */
  static canReview(closedAt: Date | null, now = new Date()) {
    return !!closedAt && now.getTime() - closedAt.getTime() <= REVIEW_WINDOW_DAYS * DAY_MS;
  }

  /** A patient's review of one of their own closed visits (history link). */
  async createForPatient(
    patientId: string,
    encounterId: string,
    rating: number,
    comment: string | undefined,
    now = new Date(),
  ) {
    const visit = await this.prisma.encounter.findFirst({
      where: { id: encounterId, patientId, status: 'COMPLETED' },
      select: { id: true, dentistId: true, closedAt: true },
    });
    if (!visit) throw new NotFoundException('Không tìm thấy lần khám này');
    if (!DentistReviewsService.canReview(visit.closedAt, now)) {
      throw new BadRequestException(`Chỉ đánh giá được trong ${REVIEW_WINDOW_DAYS} ngày sau lần khám`);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Số sao phải từ 1 đến 5');
    }
    try {
      const review = await this.prisma.dentistReview.create({
        data: {
          dentistId: visit.dentistId,
          patientId,
          encounterId,
          rating,
          comment: comment?.trim() || null,
        },
        select: { id: true, rating: true, comment: true },
      });
      await this.audit.log({
        action: 'DENTIST_REVIEW_CREATED',
        targetType: 'dentist_review',
        targetId: review.id,
        metadata: { dentistId: visit.dentistId, encounterId, rating },
      });
      return review;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Lần khám này đã được đánh giá');
      }
      throw e;
    }
  }
}
