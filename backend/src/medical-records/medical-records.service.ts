import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, EncounterStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { endOfDayInclusive } from '../common/date-range.util';
import { ENCOUNTER_CLOSED_EVENT, EncounterClosedEvent } from '../common/events/domain-events';
import {
  EncounterNotClosableException,
  EncounterNotFoundException,
  InsufficientStockException,
  PrescriptionAlreadyExistsException,
  TreatmentNotInEncounterException,
  DentalChartPatientMismatchException,
} from './domain/exceptions';
import {
  CloseEncounterDto,
  CreatePrescriptionDto,
  CreateTreatmentDto,
  SnapshotDentalChartDto,
  UpsertClinicalNoteDto,
  AddAddendumDto,
  UpdatePrescriptionDto,
  UpdateTreatmentDto,
} from './dto/medical-record.dto';
import { isMinor } from '../patients/domain/patient-rules';

/**
 * MedicalRecordsService — owns:
 *   - Encounter state machine (start via Appointment IN_PROGRESS, close)
 *   - Clinical note (CRUD + lock) and addendums (only while encounter open)
 *   - Treatment with inventory usages (auto stock-out on encounter close)
 *   - Prescription (one per encounter)
 *   - Dental chart snapshot
 *
 * Cross-module:
 *   - On encounter close: emits ENCOUNTER_CLOSED_EVENT (sync, transactional
 *     pattern: caller passes tx; we record event payload for Billing to
 *     create an invoice).
 *   - Direct Inventory dec happens here, not via listener — keeps the
 *     stock decrement atomic with the encounter close.
 */
@Injectable()
export class MedicalRecordsService {
  private readonly logger = new Logger(MedicalRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ==========================================================================
  // Encounter state machine
  // ==========================================================================

  /**
   * Resolve encounter by appointmentId (lazy-create if missing) — used by
   * the receptionist's "check-in → start encounter" flow and by the doctor
   * when they hit /encounters/current. Idempotent.
   */
  async startEncounterForAppointment(
    appointmentId: string,
    _actor: JwtPayload,
  ): Promise<{ encounterId: string }> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true, dentist: true },
    });
    if (!appt || appt.deletedAt) {
      throw new EncounterNotFoundException(appointmentId);
    }

    if (appt.status !== 'CHECKED_IN' && appt.status !== 'IN_PROGRESS') {
      throw new EncounterNotClosableException(
        `Cannot start encounter from appointment status ${appt.status}`,
      );
    }

    return this.prisma.$transaction(async tx => {
      const existing = await tx.encounter.findUnique({
        where: { appointmentId },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status === EncounterStatus.IN_PROGRESS) {
          return { encounterId: existing.id };
        }
        if (existing.status === EncounterStatus.COMPLETED) {
          throw new EncounterNotClosableException('Encounter already completed');
        }
        // CANCELLED → re-open not allowed; throw.
        if (existing.status === EncounterStatus.CANCELLED) {
          throw new EncounterNotClosableException(
            'Encounter is cancelled; create a new appointment instead',
          );
        }
      }
      if (!existing) {
        const created = await tx.encounter.create({
          data: {
            appointmentId: appt.id,
            patientId: appt.patientId,
            dentistId: appt.dentistId,
            status: EncounterStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        });
        return { encounterId: created.id };
      }
      return { encounterId: existing.id };
    });
  }

  async getEncounter(id: string) {
    const e = await this.prisma.encounter.findUnique({
      where: { id },
      include: {
        clinicalNote: {
          include: {
            addendums: { orderBy: { addedAt: 'desc' } },
            lastEditor: { select: { fullName: true } },
          },
        },
        treatments: {
          where: { deletedAt: null },
          include: { inventoryUsages: true },
          orderBy: { sequence: 'asc' },
        },
        prescription: {
          include: {
            lines: { orderBy: { sequence: 'asc' } },
            creator: { select: { fullName: true } },
          },
        },
        dentalChart: true,
        patient: { select: { id: true, code: true, fullName: true, dob: true, deletedAt: true } },
        dentist: { select: { id: true, fullName: true } },
        appointment: { select: { startAt: true, endAt: true, status: true } },
      },
    });
    if (!e) throw new EncounterNotFoundException(id);
    return this.formatEncounter(e);
  }

  // The frontend's Encounter shape wants flat patientName/dentistName,
  // lowercase status, a synthesized `notes` list (the clinical note is one
  // upsertable row, not a list of typed entries — older UI code still
  // renders it as one), and treatments/prescription reshaped from the raw
  // Prisma column names (`procedure`/`unitPrice`/`toothNumbers`) to the
  // names the tabs read (`treatmentName`/`priceCents`/`toothNumber`, etc).
  private formatEncounter(e: Record<string, any>) {
    return {
      ...e,
      patientId: e.patient?.id ?? e.patientId,
      patientCode: e.patient?.code ?? '',
      patientName: e.patient?.fullName ?? '',
      dentistId: e.dentist?.id ?? e.dentistId,
      dentistName: e.dentist?.fullName ?? '',
      status: String(e.status).toLowerCase(),
      treatments: (e.treatments ?? []).map((t: Record<string, any>) => this.formatTreatment(t)),
      prescriptions: e.prescription ? [this.formatPrescription(e.prescription)] : [],
      notes: this.formatClinicalNoteList(e.clinicalNote),
    };
  }

  private formatTreatment(t: Record<string, any>) {
    const toothNumbers: unknown[] = Array.isArray(t.toothNumbers) ? t.toothNumbers : [];
    const unitPrice = Number(t.unitPrice);
    return {
      id: t.id,
      encounterId: t.encounterId,
      toothNumber: toothNumbers[0] ?? '',
      treatmentName: t.procedure,
      procedureName: t.procedure,
      description: t.description,
      notes: t.description,
      priceCents: unitPrice,
      unitPrice,
      quantity: 1,
      lineTotalCents: unitPrice,
      total: unitPrice,
      createdAt: t.createdAt,
      inventoryItemsUsed: (t.inventoryUsages ?? []).map((u: Record<string, any>) => ({
        inventoryItemId: u.inventoryItemId,
        quantityUsed: Number(u.quantity),
      })),
    };
  }

  private formatPrescription(p: Record<string, any>) {
    const lines = (p.lines ?? []).map((l: Record<string, any>) => ({
      id: l.id,
      drugName: l.drugName,
      medicationName: l.drugName,
      dosage: l.dosage,
      frequency: l.frequency,
      duration: l.duration,
      durationDays: Number(l.duration) || undefined,
      instructions: l.instructions,
    }));
    return {
      id: p.id,
      encounterId: p.encounterId,
      diagnosis: p.diagnosis,
      note: p.notes,
      notes: p.notes,
      instructions: p.instructions,
      followUpNote: p.followUpNote,
      issuedAt: p.createdAt,
      prescribedAt: p.createdAt,
      prescribedByUserId: p.createdBy,
      prescribedByUserName: p.creator?.fullName,
      items: lines,
      lines,
    };
  }

  // Explodes the single upsertable clinical-note row into the typed-entry
  // list shape the Notes tab renders (one entry per non-empty section).
  private formatClinicalNoteList(note: Record<string, any> | null) {
    if (!note) return [];
    const sections: Array<{ type: string; content: string }> = [];
    if (note.chiefComplaint)
      sections.push({ type: 'chief_complaint', content: note.chiefComplaint });
    if (note.diagnosis) sections.push({ type: 'diagnosis', content: note.diagnosis });
    if (note.treatmentPlan) sections.push({ type: 'other', content: note.treatmentPlan });
    if (note.notes) sections.push({ type: 'other', content: note.notes });
    return sections.map((section, i) => ({
      id: `${note.id}-${i}`,
      encounterId: note.encounterId,
      type: section.type,
      content: section.content,
      createdAt: note.updatedAt ?? note.createdAt,
      createdByUserId: note.lastEditedBy,
      createdByUserName: note.lastEditor?.fullName,
    }));
  }

  async listEncounters(query: {
    patientId?: string;
    dentistId?: string;
    from?: string;
    to?: string;
    actor: JwtPayload;
  }) {
    const where: Prisma.EncounterWhereInput = {
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.dentistId && { dentistId: query.dentistId }),
      // `lte: new Date(query.to)` on a bare YYYY-MM-DD date is UTC midnight
      // — a zero-width instant, not "through end of that day". A same-day
      // from/to filter (e.g. "today") would always match nothing.
      ...((query.from || query.to) && {
        startedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: endOfDayInclusive(query.to) }),
        },
      }),
    };

    // BR-MR-019: dentist row-level
    if (
      !query.actor.permissions.includes('encounter.read.any') &&
      query.actor.permissions.includes('encounter.read.own')
    ) {
      where.dentistId = query.actor.sub;
    }

    const rows = await this.prisma.encounter.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: {
        patient: { select: { id: true, code: true, fullName: true } },
        dentist: { select: { id: true, fullName: true } },
      },
    });

    return rows.map(e => ({
      ...e,
      patientName: e.patient?.fullName ?? '',
      dentistName: e.dentist?.fullName ?? '',
      status: String(e.status).toLowerCase(),
    }));
  }

  /**
   * Close encounter:
   *   - mark Encounter.status = COMPLETED, set closedAt + summary
   *   - appointment.status = COMPLETED
   *   - decrement inventory for each treatment.inventoryUsages
   *     (atomic in same tx; throws InsufficientStockException on negative)
   *   - lock clinical note
   *
   * Caller (Billing module via EventEmitter listener) will then create the
   * invoice afterwards using the closed encounter's treatments.
   *
   * We DO NOT emit a domain event from this method; instead the controller
   * (or the listener that observes the appointment-completion hook) will
   * broadcast via EventEmitter2. Inside this service we keep things tx-safe
   * by returning the closed encounter + treatment summary so the listener
   * can produce the invoice payload.
   */
  async closeEncounter(
    encounterId: string,
    dto: CloseEncounterDto,
    actor: JwtPayload,
  ): Promise<{
    encounterId: string;
    patientId: string;
    dentistId: string;
    appointmentId: string;
    closedAt: Date;
    inventoryUsages: Array<{
      inventoryItemId: string;
      quantity: number;
      unit: string;
    }>;
    treatmentDescriptions: Array<{
      treatmentId: string;
      procedure: string;
      description: string | null;
      unitPrice: number;
    }>;
  }> {
    return this.prisma
      .$transaction(async tx => {
        const encounter = await tx.encounter.findUnique({
          where: { id: encounterId },
          include: {
            treatments: {
              where: { deletedAt: null },
              include: { inventoryUsages: true },
            },
          },
        });
        if (!encounter) throw new EncounterNotFoundException(encounterId);
        if (encounter.status === EncounterStatus.COMPLETED) {
          throw new EncounterNotClosableException('Encounter already completed');
        }
        if (encounter.status === EncounterStatus.CANCELLED) {
          throw new EncounterNotClosableException('Encounter was cancelled');
        }

        // Decrement inventory FIRST (fail-fast). Use updateMany with a
        // conditional WHERE clause to prevent read-then-update races: only
        // succeed when quantityOnHand >= usage (per BR-INV-003 stock-out).
        for (const treatment of encounter.treatments) {
          for (const usage of treatment.inventoryUsages) {
            const before = await tx.inventoryItem.findUnique({
              where: { id: usage.inventoryItemId },
              select: {
                id: true,
                name: true,
                quantityOnHand: true,
                deletedAt: true,
              },
            });
            if (!before || before.deletedAt) {
              throw new EncounterNotClosableException(
                `Inventory item ${usage.inventoryItemId} not found`,
              );
            }

            const requested = Number(usage.quantity);
            const result = await tx.inventoryItem.updateMany({
              where: {
                id: before.id,
                quantityOnHand: { gte: requested },
                deletedAt: null,
              },
              data: { quantityOnHand: { decrement: requested } },
            });
            if (result.count === 0) {
              throw new InsufficientStockException(
                before.name,
                requested,
                Number(before.quantityOnHand),
              );
            }

            const after = await tx.inventoryItem.findUnique({
              where: { id: before.id },
              select: { quantityOnHand: true },
            });
            await tx.stockMovement.create({
              data: {
                inventoryItemId: before.id,
                type: 'STOCK_OUT',
                refType: 'ENCOUNTER',
                refId: encounter.id,
                quantityBefore: before.quantityOnHand,
                quantityAfter: after?.quantityOnHand ?? 0,
                diff: -requested,
                reason: `Encounter ${encounter.id}`,
                performedBy: actor.sub,
              },
            });
          }
        }

        // Mark encounter COMPLETED
        const closedAt = new Date();
        await tx.encounter.update({
          where: { id: encounterId },
          data: {
            status: EncounterStatus.COMPLETED,
            closedAt,
            summary: dto.summary ?? encounter.summary,
          },
        });

        // Lock clinical note (if present)
        await tx.clinicalNote.updateMany({
          where: { encounterId },
          data: { isLocked: true, lockedAt: closedAt },
        });

        // Mark appointment COMPLETED
        await tx.appointment.update({
          where: { id: encounter.appointmentId },
          data: { status: 'COMPLETED', updatedBy: actor.sub },
        });

        // Encounter audit row
        await tx.encounterAudit.create({
          data: {
            encounterId,
            action: 'CLOSED',
            actorId: actor.sub,
            before: { status: encounter.status },
            after: { status: 'COMPLETED', closedAt },
          },
        });

        await this.audit.log({
          action: 'ENCOUNTER_CLOSED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'encounter',
          targetId: encounterId,
          metadata: {
            patientId: encounter.patientId,
            appointmentId: encounter.appointmentId,
            treatmentCount: encounter.treatments.length,
            inventoryUsagesCount: encounter.treatments.reduce(
              (acc, t) => acc + t.inventoryUsages.length,
              0,
            ),
          },
        });

        const result: EncounterClosedEvent = {
          encounterId: encounter.id,
          appointmentId: encounter.appointmentId,
          patientId: encounter.patientId,
          dentistId: encounter.dentistId,
          closedAt,
          treatments: encounter.treatments.map(t => ({
            treatmentId: t.id,
            procedure: t.procedure,
            description: t.description,
            unitPrice: Number(t.unitPrice),
          })),
          inventoryUsages: encounter.treatments.flatMap(t =>
            t.inventoryUsages.map(u => ({
              inventoryItemId: u.inventoryItemId,
              quantity: Number(u.quantity),
              unit: u.unit,
            })),
          ),
        };

        // Sync emit — listeners (Billing) run after the tx commits.
        // The actual emit happens after the $transaction returns below.
        return result;
      })
      .then(async event => {
        this.events.emit(ENCOUNTER_CLOSED_EVENT, event);
        // Combined return shape for callers; backward-compat fields preserved.
        return {
          encounterId: event.encounterId,
          patientId: event.patientId,
          dentistId: event.dentistId,
          appointmentId: event.appointmentId,
          closedAt: event.closedAt,
          inventoryUsages: event.inventoryUsages,
          treatmentDescriptions: event.treatments,
        };
      });
  }

  /**
   * Cancel an in-progress encounter (admin/dentist override; BR-MR-005).
   */
  async cancelEncounter(encounterId: string, reason: string, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) throw new EncounterNotFoundException(encounterId);
      if (encounter.status !== EncounterStatus.IN_PROGRESS) {
        throw new EncounterNotClosableException(
          `Cannot cancel encounter in status ${encounter.status}`,
        );
      }
      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: actor.sub,
          cancelledReason: reason,
        },
      });
      await tx.encounterAudit.create({
        data: {
          encounterId,
          action: 'CANCELLED',
          actorId: actor.sub,
          after: { status: 'CANCELLED' },
        },
      });
    });
  }

  // ==========================================================================
  // Clinical note
  // ==========================================================================

  async upsertClinicalNote(encounterId: string, dto: UpsertClinicalNoteDto, actor: JwtPayload) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });
    if (!encounter) throw new EncounterNotFoundException(encounterId);

    const existing = await this.prisma.clinicalNote.findUnique({
      where: { encounterId },
    });
    if (existing?.isLocked) {
      throw new EncounterNotClosableException(
        'Clinical note is locked because encounter is closed; only addendums allowed (BR-MR-007)',
      );
    }

    const note = await this.prisma.clinicalNote.upsert({
      where: { encounterId },
      create: {
        encounterId,
        chiefComplaint: dto.chiefComplaint ?? null,
        diagnosis: dto.diagnosis ?? null,
        treatmentPlan: dto.treatmentPlan ?? null,
        notes: dto.notes ?? null,
        lastEditedBy: actor.sub,
      },
      update: {
        ...(dto.chiefComplaint !== undefined && { chiefComplaint: dto.chiefComplaint }),
        ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
        ...(dto.treatmentPlan !== undefined && { treatmentPlan: dto.treatmentPlan }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        lastEditedBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'CLINICAL_NOTE_UPSERTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'encounter',
      targetId: encounterId,
      metadata: { noteId: note.id },
    });

    return note;
  }

  async addAddendum(encounterId: string, dto: AddAddendumDto, actor: JwtPayload) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { clinicalNote: true },
    });
    if (!encounter) throw new EncounterNotFoundException(encounterId);
    if (!encounter.clinicalNote) {
      throw new EncounterNotClosableException('No clinical note exists yet');
    }
    if (encounter.clinicalNote.isLocked && encounter.status === EncounterStatus.IN_PROGRESS) {
      // While IN_PROGRESS, addendums allowed even if locked
    } else if (encounter.clinicalNote.isLocked) {
      throw new EncounterNotClosableException('Encounter is closed');
    }

    const addendum = await this.prisma.clinicalNoteAddendum.create({
      data: {
        clinicalNoteId: encounter.clinicalNote.id,
        content: dto.content,
        addedBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'CLINICAL_NOTE_ADDENDUM_ADDED',
      actorUserId: actor.sub,
      targetType: 'encounter',
      targetId: encounterId,
      metadata: { addendumId: addendum.id },
    });

    return addendum;
  }

  // ==========================================================================
  // Treatments
  // ==========================================================================

  async createTreatment(encounterId: string, dto: CreateTreatmentDto, actor: JwtPayload) {
    const encounter = await this.prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter) throw new EncounterNotFoundException(encounterId);
    if (encounter.status !== EncounterStatus.IN_PROGRESS) {
      throw new EncounterNotClosableException('Cannot add treatments to non-IN_PROGRESS encounter');
    }

    // Determine next sequence
    const maxSeq = await this.prisma.treatment.aggregate({
      where: { encounterId, deletedAt: null },
      _max: { sequence: true },
    });
    const sequence = (maxSeq._max.sequence ?? -1) + 1;

    const treatment = await this.prisma.$transaction(async tx => {
      const t = await tx.treatment.create({
        data: {
          encounterId,
          procedure: dto.procedure,
          description: dto.description ?? null,
          unitPrice: dto.unitPrice,
          durationMinutes: dto.durationMinutes ?? null,
          toothNumbers: (dto.toothNumbers ?? []) as unknown as Prisma.InputJsonValue,
          sequence,
          createdBy: actor.sub,
        },
      });
      for (const usage of dto.inventoryUsages ?? []) {
        await tx.treatmentInventoryUsage.create({
          data: {
            treatmentId: t.id,
            inventoryItemId: usage.inventoryItemId,
            quantity: usage.quantity,
            unit: usage.unit,
          },
        });
      }
      return t;
    });

    await this.audit.log({
      action: 'TREATMENT_CREATED',
      actorUserId: actor.sub,
      targetType: 'encounter',
      targetId: encounterId,
      metadata: { treatmentId: treatment.id, procedure: dto.procedure },
    });

    return treatment;
  }

  async updateTreatment(
    encounterId: string,
    treatmentId: string,
    dto: UpdateTreatmentDto,
    _actor: JwtPayload,
  ) {
    const t = await this.prisma.treatment.findUnique({ where: { id: treatmentId } });
    if (!t || t.encounterId !== encounterId) throw new TreatmentNotInEncounterException();
    if (t.deletedAt) throw new TreatmentNotInEncounterException();

    return this.prisma.treatment.update({
      where: { id: treatmentId },
      data: {
        ...(dto.procedure !== undefined && { procedure: dto.procedure }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
      },
    });
  }

  async deleteTreatment(encounterId: string, treatmentId: string, actor: JwtPayload) {
    const t = await this.prisma.treatment.findUnique({ where: { id: treatmentId } });
    if (!t || t.encounterId !== encounterId) throw new TreatmentNotInEncounterException();
    if (t.deletedAt) return; // idempotent

    await this.prisma.treatment.update({
      where: { id: treatmentId },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      action: 'TREATMENT_DELETED',
      actorUserId: actor.sub,
      targetType: 'encounter',
      targetId: encounterId,
      metadata: { treatmentId },
    });
  }

  // ==========================================================================
  // Prescription
  // ==========================================================================

  async upsertPrescription(encounterId: string, dto: CreatePrescriptionDto, actor: JwtPayload) {
    const encounter = await this.prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter) throw new EncounterNotFoundException(encounterId);

    const existing = await this.prisma.prescription.findUnique({ where: { encounterId } });
    if (existing) {
      throw new PrescriptionAlreadyExistsException();
    }

    const prescription = await this.prisma.$transaction(async tx => {
      const p = await tx.prescription.create({
        data: {
          encounterId,
          diagnosis: dto.diagnosis ?? null,
          instructions: dto.instructions ?? null,
          followUpNote: dto.followUpNote ?? null,
          notes: dto.notes ?? null,
          createdBy: actor.sub,
        },
      });
      for (let i = 0; i < dto.lines.length; i++) {
        const line = dto.lines[i];
        await tx.prescriptionLine.create({
          data: {
            prescriptionId: p.id,
            sequence: i,
            drugName: line.drugName,
            dosage: line.dosage ?? '',
            frequency: line.frequency ?? '',
            duration: line.durationDays ? String(line.durationDays) : '',
            instructions: line.instructions ?? null,
          },
        });
      }
      return p;
    });

    await this.audit.log({
      action: 'PRESCRIPTION_CREATED',
      actorUserId: actor.sub,
      targetType: 'encounter',
      targetId: encounterId,
      metadata: {
        prescriptionId: prescription.id,
        lineCount: dto.lines.length,
        hasDiagnosis: !!dto.diagnosis,
        hasInstructions: !!dto.instructions,
        hasFollowUpNote: !!dto.followUpNote,
      },
    });

    return prescription;
  }

  /**
   * Partial update of a prescription (PATCH semantics).
   *
   * Lines themselves are not edited here — callers replace the whole
   * prescription via the POST upsert path. This method updates the
   * header-level fields (diagnosis, instructions, followUpNote, notes)
   * and bumps `version` for optimistic concurrency.
   */
  async updatePrescription(prescriptionId: string, dto: UpdatePrescriptionDto, actor: JwtPayload) {
    const existing = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });
    if (!existing || existing.deletedAt) {
      throw new EncounterNotFoundException(prescriptionId);
    }

    const updated = await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
        ...(dto.instructions !== undefined && { instructions: dto.instructions }),
        ...(dto.followUpNote !== undefined && { followUpNote: dto.followUpNote }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        version: { increment: 1 },
      },
    });

    await this.audit.log({
      action: 'PRESCRIPTION_UPDATED',
      actorUserId: actor.sub,
      targetType: 'prescription',
      targetId: prescriptionId,
      metadata: { encounterId: existing.encounterId, fields: Object.keys(dto) },
    });

    return updated;
  }

  /**
   * Soft-delete a prescription. Encounter-level link is preserved so the
   * audit trail and historical printing remain intact.
   */
  async deletePrescription(prescriptionId: string, actor: JwtPayload) {
    const existing = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });
    if (!existing || existing.deletedAt) return; // idempotent

    await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      action: 'PRESCRIPTION_DELETED',
      actorUserId: actor.sub,
      targetType: 'prescription',
      targetId: prescriptionId,
      metadata: { encounterId: existing.encounterId },
    });
  }

  // ==========================================================================
  // Dental chart snapshot
  // ==========================================================================

  async snapshotDentalChart(encounterId: string, dto: SnapshotDentalChartDto, actor: JwtPayload) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { patient: { select: { dob: true, deletedAt: true } } },
    });
    if (!encounter) throw new EncounterNotFoundException(encounterId);
    if (encounter.patient.deletedAt) {
      throw new EncounterNotClosableException('Patient is deleted');
    }

    // BR-MR-012: patientType must match age band
    const minor = isMinor(new Date(encounter.patient.dob));
    const expected = minor ? 'CHILD' : 'ADULT';
    if (dto.patientType !== expected) {
      throw new DentalChartPatientMismatchException();
    }

    const existing = await this.prisma.dentalChartSnapshot.findUnique({
      where: { encounterId },
    });
    if (existing) {
      // Overwrite but keep audit trail
      const updated = await this.prisma.dentalChartSnapshot.update({
        where: { encounterId },
        data: {
          patientType: dto.patientType,
          teeth: dto.teeth as unknown as Prisma.InputJsonValue,
          snapshotAt: new Date(),
          snapshotBy: actor.sub,
        },
      });
      return updated;
    }
    return this.prisma.dentalChartSnapshot.create({
      data: {
        encounterId,
        patientType: dto.patientType,
        teeth: dto.teeth as unknown as Prisma.InputJsonValue,
        snapshotBy: actor.sub,
      },
    });
  }

  /**
   * Read the latest dental chart snapshot for a patient (across encounters).
   * Used by the Patients proxy controller too.
   */
  async getLatestDentalChartForPatient(patientId: string) {
    const lastEncounter = await this.prisma.encounter.findFirst({
      where: { patientId, dentalChart: { isNot: null } },
      orderBy: { startedAt: 'desc' },
      include: { dentalChart: true },
    });
    return lastEncounter?.dentalChart ?? null;
  }

  /**
   * List encounters for patient (used by PatientsProxyController).
   * Returns minimal payload — full payload must use /encounters/:id.
   */
  async getEncountersForPatient(patientId: string, actor: JwtPayload, limit = 50) {
    const where: Prisma.EncounterWhereInput = { patientId };
    if (
      !actor.permissions.includes('encounter.read.any') &&
      actor.permissions.includes('encounter.read.own')
    ) {
      where.dentistId = actor.sub;
    }
    return this.prisma.encounter.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        dentist: { select: { fullName: true } },
        appointment: { select: { id: true, startAt: true, status: true } },
      },
    });
  }
}
