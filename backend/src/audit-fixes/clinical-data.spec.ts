import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalRecordsService } from '../medical-records/medical-records.service';
import { SnapshotDentalChartDto } from '../medical-records/dto/medical-record.dto';
import { EncounterNotFoundException } from '../medical-records/domain/exceptions';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { dentistPayload, validEncounter } from '../../test/helpers';

describe('Clinical data audit regressions', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata = { type: 'body' as const, metatype: SnapshotDentalChartDto };

  it('MR-04 preserves tooth entries through the production validation pipe', async () => {
    const payload = {
      patientType: 'ADULT',
      teeth: { '16': { status: 'FILLED', notes: 'Review' } },
    };
    expect(await pipe.transform(payload, metadata)).toEqual(payload);
  });

  it.each([undefined, null, [], 'invalid', 1])('MR-04 rejects invalid teeth %p', async teeth => {
    await expect(pipe.transform({ patientType: 'ADULT', teeth }, metadata)).rejects.toThrow();
  });

  describe('MR-02 addendum window', () => {
    const actor = dentistPayload();
    const now = new Date('2026-09-15T00:00:00Z');
    let db: ReturnType<typeof createPrismaMock>;
    let service: MedicalRecordsService;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      db = createPrismaMock();
      service = new MedicalRecordsService(
        db as unknown as PrismaService,
        { log: jest.fn() } as unknown as AuditService,
        {} as EventEmitter2,
      );
      db.clinicalNoteAddendum.create.mockResolvedValue({ id: 'a', content: 'Correction' });
    });

    afterEach(() => jest.restoreAllMocks());

    function encounter(ageMs: number, dentistId = actor.sub) {
      return {
        ...validEncounter({
          dentistId,
          status: 'COMPLETED',
          closedAt: new Date(now.getTime() - ageMs),
        }),
        clinicalNote: { id: 'note', isLocked: true },
      };
    }

    it.each([5 * 86400000, 30 * 86400000 - 1])(
      'allows a locked note within the window (%d ms)',
      async age => {
        db.encounter.findUnique.mockResolvedValue(encounter(age));
        await expect(service.addAddendum('e', { content: 'Correction' }, actor)).resolves.toEqual({
          id: 'a',
          content: 'Correction',
        });
        expect(db.clinicalNoteAddendum.create).toHaveBeenCalledWith({
          data: { clinicalNoteId: 'note', content: 'Correction', addedBy: actor.sub },
        });
        expect(db.clinicalNote.update).not.toHaveBeenCalled();
      },
    );

    it.each([30 * 86400000, 31 * 86400000])('rejects expired corrections (%d ms)', async age => {
      db.encounter.findUnique.mockResolvedValue(encounter(age));
      await expect(service.addAddendum('e', { content: 'Correction' }, actor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.clinicalNoteAddendum.create).not.toHaveBeenCalled();
    });

    it('keeps another dentist’s note inaccessible', async () => {
      db.encounter.findUnique.mockResolvedValue(encounter(86400000, 'other'));
      await expect(service.addAddendum('e', { content: 'Correction' }, actor)).rejects.toThrow(
        EncounterNotFoundException,
      );
      expect(db.clinicalNoteAddendum.create).not.toHaveBeenCalled();
    });

    it('rejects a cancelled encounter', async () => {
      db.encounter.findUnique.mockResolvedValue({ ...encounter(86400000), status: 'CANCELLED' });
      await expect(service.addAddendum('e', { content: 'Correction' }, actor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.clinicalNoteAddendum.create).not.toHaveBeenCalled();
    });
  });
});
