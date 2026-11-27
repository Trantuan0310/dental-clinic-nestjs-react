import { NotFoundException } from '@nestjs/common';
import {
  PatientHistoryService,
  historyLinkHash,
  maskContact,
  reviewKey,
} from './patient-history.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { EmailService } from '../common/services/email.service';
import type { MessagingService } from '../messaging/messaging.service';
import type { JwtPayload } from '../common/guards/permissions.guard';
import { DentistReviewsService } from '../dentist-reviews/dentist-reviews.service';

const TOKEN = 'a'.repeat(43);
const NOW = new Date('2026-11-15T03:00:00Z');

function setup() {
  const db = {
    patient: { findUnique: jest.fn(), findMany: jest.fn() },
    patientHistoryLink: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    encounter: { findMany: jest.fn().mockResolvedValue([]) },
    treatmentPlan: { findMany: jest.fn().mockResolvedValue([]) },
    appointment: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    dentistReview: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(true) };
  const messaging = { send: jest.fn().mockResolvedValue('MOCKED') };
  const service = new PatientHistoryService(
    db as unknown as PrismaService,
    audit as unknown as AuditService,
    email as unknown as EmailService,
    messaging as unknown as MessagingService,
    new DentistReviewsService(db as unknown as PrismaService, audit as unknown as AuditService),
  );
  return { db, audit, email, messaging, service };
}

const staff = {
  sub: 'u1',
  email: 'le.tan@clinic.local',
  permissions: ['patient.read'],
} as unknown as JwtPayload;

describe('PatientHistoryService', () => {
  it('masks where a link went', () => {
    expect(maskContact('0901234567')).toBe('090****567');
    expect(maskContact('an@example.com')).toBe('a***@example.com');
  });

  it('staff link: stores only the hash, sends to the email and phone on file, audits', async () => {
    const { db, audit, email, messaging, service } = setup();
    db.patient.findUnique.mockResolvedValue({
      id: 'p1',
      fullName: 'Nguyễn Văn A',
      email: 'a@example.com',
      primaryPhone: '0901234567',
      deletedAt: null,
    });
    const res = await service.issueForPatient('p1', staff);
    const stored = db.patientHistoryLink.create.mock.calls[0][0].data;
    const token = res.url.split('/lich-su/')[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored.tokenHash).toBe(historyLinkHash(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(+stored.expiresAt - Date.now()).toBeGreaterThan(6 * 86_400_000);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@example.com' }));
    expect(messaging.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'HISTORY_LINK' }),
    );
    expect(res.sentTo).toEqual(['a***@example.com', '090****567']);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PATIENT_HISTORY_LINK_ISSUED' }),
    );
  });

  it('phone request: same answer for a stranger, link only to the owner of the number', async () => {
    const { db, email, service } = setup();
    db.patient.findMany.mockResolvedValue([
      // Owner of the number.
      {
        id: 'p1',
        fullName: 'A',
        dob: new Date('1990-01-01'),
        email: 'a@example.com',
        primaryPhone: '0901 234 567',
        contactPersonPhone: null,
      },
      // An adult who only lists the number as emergency contact: not theirs.
      {
        id: 'p2',
        fullName: 'B',
        dob: new Date('1960-01-01'),
        email: 'b@example.com',
        primaryPhone: '0911111111',
        contactPersonPhone: '0901234567',
      },
    ]);
    const known = await service.requestByPhone('+84 901 234 567');
    expect(db.patientHistoryLink.create).toHaveBeenCalledTimes(1);
    expect(db.patientHistoryLink.create.mock.calls[0][0].data.patientId).toBe('p1');
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(known)).not.toMatch(/lich-su|example\.com/);

    db.patient.findMany.mockResolvedValue([]);
    const unknown = await service.requestByPhone('0999999999');
    expect(unknown).toEqual(known);
  });

  it('view: refuses a bad, unknown or expired link the same way', async () => {
    const { db, service } = setup();
    await expect(service.view('short', NOW)).rejects.toBeInstanceOf(NotFoundException);
    db.patientHistoryLink.findUnique.mockResolvedValue(null);
    await expect(service.view(TOKEN, NOW)).rejects.toBeInstanceOf(NotFoundException);
    db.patientHistoryLink.findUnique.mockResolvedValue({
      id: 'l1',
      patientId: 'p1',
      expiresAt: new Date('2026-11-14T00:00:00Z'),
      patient: { deletedAt: null },
    });
    await expect(service.view(TOKEN, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.encounter.findMany).not.toHaveBeenCalled();
  });

  it('view: the patient own completed visits, plans, upcoming visits and invoices', async () => {
    const { db, audit, service } = setup();
    db.patientHistoryLink.findUnique.mockResolvedValue({
      id: 'l1',
      patientId: 'p1',
      expiresAt: new Date('2026-11-20T00:00:00Z'),
      patient: {
        id: 'p1',
        code: 'PAT-1',
        fullName: 'Nguyễn Văn A',
        dob: new Date('1990-01-01'),
        deletedAt: null,
      },
    });
    db.encounter.findMany.mockResolvedValue([
      {
        id: 'e1',
        startedAt: new Date('2026-10-01T02:00:00Z'),
        closedAt: new Date('2026-10-01T03:00:00Z'),
        chiefComplaint: 'Đau răng',
        diagnosis: 'Sâu răng 36',
        summary: 'Đã trám',
        dentist: { fullName: 'BS B' },
        treatments: [{ procedure: 'Trám răng composite', toothNumbers: [36], quantity: 1 }],
        prescription: {
          deletedAt: null,
          lines: [
            {
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: '2 lần/ngày',
              duration: '3 ngày',
            },
          ],
        },
      },
    ]);
    db.treatmentPlan.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Phục hình',
        status: 'IN_PROGRESS',
        items: [
          { procedure: 'Bọc sứ', toothNumbers: [11], status: 'DONE' },
          { procedure: 'Bọc sứ', toothNumbers: [21], status: 'PLANNED' },
        ],
      },
    ]);
    db.invoice.findMany.mockResolvedValue([
      {
        code: 'INV-1',
        issuedAt: new Date(),
        status: 'PARTIAL',
        total: '1000000',
        paidAmount: '600000',
        outstandingAmount: '400000',
      },
    ]);
    const res = await service.view(TOKEN, NOW);
    expect(db.encounter.findMany.mock.calls[0][0].where).toEqual({
      patientId: 'p1',
      status: 'COMPLETED',
    });
    expect(res.visits[0]).toMatchObject({
      dentistName: 'BS B',
      treatments: [{ name: 'Trám răng composite', teeth: [36], quantity: 1 }],
    });
    expect(res.visits[0].prescription[0].drugName).toBe('Paracetamol');
    expect(res.plans[0]).toMatchObject({ done: 1, total: 2 });
    expect(res.invoices[0]).toMatchObject({ total: 1_000_000, outstanding: 400_000 });
    // Nothing internal leaks: no ids of other records, no contact details.
    expect(JSON.stringify(res)).not.toMatch(/"id"|phone|email/i);
    expect(db.patientHistoryLink.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { lastUsedAt: NOW },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PATIENT_HISTORY_VIEWED', targetId: 'p1' }),
    );
  });

  it('review: a visit is named by a key only this link can make, never by its id', async () => {
    const { db, service } = setup();
    const link = {
      id: 'l1',
      patientId: 'p1',
      tokenHash: historyLinkHash(TOKEN),
      expiresAt: new Date('2026-11-20T00:00:00Z'),
      patient: {
        id: 'p1',
        code: 'PAT-1',
        fullName: 'A',
        dob: new Date('1990-01-01'),
        deletedAt: null,
      },
    };
    db.patientHistoryLink.findUnique.mockResolvedValue(link);
    db.encounter.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    Object.assign(db.encounter, {
      findFirst: jest.fn().mockResolvedValue({ id: 'e2', dentistId: 'd1', closedAt: NOW }),
    });
    db.dentistReview.create.mockResolvedValue({ id: 'r1', rating: 4, comment: null });

    await expect(service.review(TOKEN, 'f'.repeat(24), 4, undefined, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.review(TOKEN, reviewKey(link.tokenHash, 'e2'), 4, undefined, NOW),
    ).resolves.toEqual({ rating: 4, comment: null });
    expect(db.dentistReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ encounterId: 'e2', patientId: 'p1' }),
      }),
    );
  });
});
