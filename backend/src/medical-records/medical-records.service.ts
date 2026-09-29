import { ForbiddenException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, EncounterStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { clinicDateOnly, endOfDayInclusive, startOfClinicDay } from '../common/date-range.util';
import {
  ENCOUNTER_CLOSED_EVENT,
  EncounterClosedEvent,
  PATIENT_CLINICAL_DATA_CHANGED_EVENT,
  PatientClinicalDataChangedEvent,
} from '../common/events/domain-events';
import {
  EncounterNotClosableException,
  EncounterNotFoundException,
  InsufficientStockException,
  PrescriptionAlreadyExistsException,
  PrescriptionAllergyConflictException,
  PrescriptionVersionConflictException,
  TreatmentNotInEncounterException,
  DentalChartPatientMismatchException,
  DentalChartInvalidToothException,
} from './domain/exceptions';
import { isValidFdiToothNumber } from './domain/tooth-numbers';
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
import { isMinor, readJsonStringArray } from '../patients/domain/patient-rules';
import { AllergyConflict, findAllergyConflicts, normalizeTerm } from './domain/allergy-check';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { closeQueueEntry, reopenStartedQueueEntry } from '../appointments/domain/queue';
import { reopenCancelledEncounter } from './domain/reopen-encounter';
import { dentistCanReadPatient } from '../common/dentist-patient-access';

/** left_reason of a visit whose exam, started on an earlier day, was cancelled. */
const PAST_DAY_ENCOUNTER_CANCELLED_REASON = 'Hủy phiên khám của ngày trước';

/**
 * MedicalRecordsService — owns:
 *   - Encounter state machine (start via Appointment IN_PROGRESS, close)
 *   - Clinical note (CRUD + lock) and addendums (within 30 days after close)
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

  /**
   * True when the actor may only see/modify encounters they personally
   * treated — a plain dentist (holds encounter.read.own, not the
   * clinic-wide encounter.read.any). Single source of truth for every
   * encounter-scoped row-level check in this service: getEncounter() and
   * listEncounters() used to each inline their own copy of this exact
   * condition, and closeEncounter/upsertClinicalNote/addAddendum/
   * createTreatment/updateTreatment/deleteTreatment/upsertPrescription/
   * updatePrescription/deletePrescription/snapshotDentalChart had NO
   * ownership check at all — any dentist could close, add notes/
   * treatments/prescriptions to, or snapshot the dental chart of ANY
   * other dentist's encounter, not just their own (live-verified gap
   * flagged by the whole-system audit; per
   * docs/03_Specification/MedicalRecords/SPEC.md §7.1, every one of
   * these is documented 🔒 (own) for dentist. Reads are wider: a dentist
   * may read (never write) the whole record of a patient they treated or
   * are booked with — see common/dentist-patient-access.ts).
   *
   * Deliberately NOT used by startEncounterForAppointment or
   * listEncounters, whose row-scope checks need the extra
   * `encounter.read.own` presence test so a receptionist (who holds
   * neither .own nor .any, but legitimately preps any dentist's
   * encounter during check-in and needs to see every encounter when
   * listing) isn't wrongly scoped there — this simpler check alone would
   * treat her as row-scoped too (she lacks .any) and wrongly hide
   * everyone else's encounters from her.
   */
  private isRowScopedDentist(actor: JwtPayload): boolean {
    return !actor.permissions.includes('encounter.read.any');
  }

  /**
   * The front-desk variant used by startEncounterForAppointment and
   * listEncounters (see above): only a caller who holds encounter.read.own
   * and not .any is limited to their own encounters, so a role with neither
   * (receptionist) is not. Keep the two checks separate on purpose — making
   * the one above "consistent" with this would open every clinical write to
   * such roles, and the reverse would block front-desk check-in.
   */
  private isRowScopedDentistExceptFrontDesk(actor: JwtPayload): boolean {
    return (
      actor.permissions.includes('encounter.read.own') &&
      !actor.permissions.includes('encounter.read.any')
    );
  }

  private async lockEncounter(tx: Prisma.TransactionClient, encounterId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM encounters WHERE id = ${encounterId}::uuid FOR UPDATE`;
  }

  /** After commit: lets cached derivatives (AI summary) drop stale data. */
  private emitClinicalDataChanged(patientId: string | undefined): void {
    if (!patientId) return;
    const payload: PatientClinicalDataChangedEvent = { patientId };
    this.events.emit(PATIENT_CLINICAL_DATA_CHANGED_EVENT, payload);
  }

  private async withEditableEncounter<T>(
    encounterId: string,
    actor: JwtPayload,
    write: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let patientId: string | undefined;
    const result = await this.prisma.$transaction(async tx => {
      // All clinical writes and close share this lock, including first-note creation.
      await this.lockEncounter(tx, encounterId);
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter || (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub)) {
        throw new EncounterNotFoundException(encounterId);
      }
      if (encounter.status !== EncounterStatus.IN_PROGRESS) {
        throw new EncounterNotClosableException('Only IN_PROGRESS encounters can be edited');
      }
      patientId = encounter.patientId;
      return write(tx);
    });
    this.emitClinicalDataChanged(patientId);
    return result;
  }

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
    actor: JwtPayload,
  ): Promise<{ encounterId: string }> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true, dentist: true },
    });
    if (!appt || appt.deletedAt) {
      throw new EncounterNotFoundException(appointmentId);
    }

    // Row-level: a plain dentist (encounter.read.own, no .any) may only
    // start an encounter for their OWN appointment. Receptionist holds
    // neither .own nor .any (she has encounter.read.basic instead) but
    // legitimately preps the encounter record for any dentist's
    // checked-in patient — front-desk workflow — so she isn't row-scoped
    // here. This method previously ignored `actor` entirely, letting a
    // dentist create an Encounter (dentistId: appt.dentistId) for a
    // colleague's appointment.
    if (this.isRowScopedDentistExceptFrontDesk(actor) && appt.dentistId !== actor.sub) {
      throw new EncounterNotFoundException(appointmentId);
    }

    if (appt.status !== 'CHECKED_IN' && appt.status !== 'IN_PROGRESS') {
      throw new EncounterNotClosableException(
        `Cannot start encounter from appointment status ${appt.status}`,
      );
    }

    let opened = false;
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
      const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!current || current.deletedAt) throw new EncounterNotFoundException(appointmentId);
      if (current.status !== 'CHECKED_IN' && current.status !== 'IN_PROGRESS') {
        throw new EncounterNotClosableException(
          `Cannot start encounter from appointment status ${current.status}`,
        );
      }
      const existing = await tx.encounter.findUnique({
        where: { appointmentId },
        select: { id: true, status: true },
      });
      if (existing?.status === EncounterStatus.COMPLETED) {
        throw new EncounterNotClosableException('Encounter already completed');
      }
      await closeQueueEntry(tx, appointmentId, 'STARTED', actor.sub);
      if (current.status === 'CHECKED_IN') {
        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: 'IN_PROGRESS', updatedBy: actor.sub },
        });
      }
      // A cancelled encounter whose patient is back at CHECKED_IN (see
      // cancelEncounter) is restarted on the same row — appointment_id is
      // unique. Anything recorded before the cancel stays visible and
      // editable; the cancel/reopen pair is kept in encounter_audits.
      if (existing?.status === EncounterStatus.CANCELLED) {
        await reopenCancelledEncounter(tx, existing.id, current.dentistId, actor.sub);
        opened = true;
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
        opened = true;
        return { encounterId: created.id };
      }
      return { encounterId: existing.id };
    });
    if (opened) this.emitClinicalDataChanged(appt.patientId);
    return result;
  }

  async getEncounter(id: string, actor: JwtPayload) {
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
            // Replaced lines are soft-deleted (upsertPrescription).
            lines: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } },
            creator: { select: { fullName: true } },
          },
        },
        dentalChart: true,
        patient: { select: { id: true, code: true, fullName: true, dob: true, deletedAt: true } },
        dentist: { select: { id: true, fullName: true } },
        appointment: { select: { startAt: true, endAt: true, status: true } },
        // Only whether it was ever reopened after a cancel (formatEncounter).
        audits: { where: { action: 'REOPENED' }, select: { id: true }, take: 1 },
      },
    });
    if (!e) throw new EncounterNotFoundException(id);
    // Row-level: a caller without encounter.read.any (i.e. only
    // encounter.read.own) may read their own encounters, plus — read-only —
    // any encounter of a patient they have treated or are booked with
    // (dentistCanReadPatient). 404 rather than 403 so out-of-scope ids
    // can't be enumerated.
    if (
      this.isRowScopedDentist(actor) &&
      e.dentistId !== actor.sub &&
      !(await dentistCanReadPatient(this.prisma, e.patientId, actor.sub))
    ) {
      throw new EncounterNotFoundException(id);
    }
    return this.formatEncounter(e);
  }

  // The frontend's Encounter shape wants flat patientName/dentistName,
  // lowercase status, a synthesized `notes` list (the clinical note is one
  // upsertable row, not a list of typed entries — older UI code still
  // renders it as one), and treatments/prescription reshaped from the raw
  // Prisma column names (`procedure`/`unitPrice`/`toothNumbers`) to the
  // names the tabs read (`treatmentName`/`priceCents`/`toothNumber`, etc).
  private formatEncounter(e: Record<string, any>) {
    // A to-one include can't filter, so drop a soft-deleted prescription here
    // (it used to be returned and printed as if still valid).
    const prescription = e.prescription && !e.prescription.deletedAt ? e.prescription : null;
    const { audits, ...rest } = e;
    const treatments = e.treatments ?? [];
    // Reopened after a cancel (reopenCancelledEncounter) with data recorded
    // before the cancel still attached: the UI asks the dentist to review it
    // before closing, since those treatments would be invoiced.
    const reopenedFromCancel =
      e.status === EncounterStatus.IN_PROGRESS &&
      Array.isArray(audits) &&
      audits.length > 0 &&
      (treatments.length > 0 || !!prescription || !!e.clinicalNote);
    return {
      ...rest,
      prescription,
      reopenedFromCancel,
      patientId: e.patient?.id ?? e.patientId,
      patientCode: e.patient?.code ?? '',
      patientName: e.patient?.fullName ?? '',
      dentistId: e.dentist?.id ?? e.dentistId,
      dentistName: e.dentist?.fullName ?? '',
      status: String(e.status).toLowerCase(),
      treatments: (e.treatments ?? []).map((t: Record<string, any>) => this.formatTreatment(t)),
      prescriptions: prescription ? [this.formatPrescription(prescription)] : [],
      notes: this.formatClinicalNoteList(e.clinicalNote),
      // BR-MR-012: the chart type snapshotDentalChart will accept, so the
      // UI never has to re-derive the age band on its own clock.
      ...(e.patient?.dob && {
        dentalChartPatientType: isMinor(new Date(e.patient.dob)) ? 'CHILD' : 'ADULT',
      }),
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
      quantity: l.quantity ?? undefined,
      unit: l.unit ?? undefined,
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
      version: p.version,
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

    // BR-MR-019: dentist row-level — own encounters only, except a single
    // patient's history, which is readable in full once the dentist has
    // treated or is booked with that patient (same rule as getEncounter).
    if (this.isRowScopedDentistExceptFrontDesk(query.actor)) {
      const wholePatientHistory =
        !!query.patientId &&
        (await dentistCanReadPatient(this.prisma, query.patientId, query.actor.sub));
      if (!wholePatientHistory) where.dentistId = query.actor.sub;
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
        await this.lockEncounter(tx, encounterId);
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
        if (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub) {
          throw new EncounterNotFoundException(encounterId);
        }
        if (encounter.status === EncounterStatus.COMPLETED) {
          throw new EncounterNotClosableException('Encounter already completed');
        }
        if (encounter.status === EncounterStatus.CANCELLED) {
          throw new EncounterNotClosableException('Encounter was cancelled');
        }

        // An allergy recorded after the prescription was saved must not slip
        // through: re-screen before anything is written.
        const allergyOverride = await this.screenPrescriptionAtClose(
          tx,
          encounterId,
          encounter.patientId,
          dto.allergyOverrideReason,
        );

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

        if (allergyOverride) {
          await this.audit.log({
            action: 'PRESCRIPTION_ALLERGY_OVERRIDE',
            actorUserId: actor.sub,
            actorEmail: actor.email,
            targetType: 'encounter',
            targetId: encounterId,
            metadata: {
              prescriptionId: allergyOverride.prescriptionId,
              patientId: encounter.patientId,
              reason: allergyOverride.reason,
              conflicts: allergyOverride.conflicts,
              atClose: true,
            },
          });
        }

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
   * Row-level like every other clinical write: a caller without
   * encounter.read.any may only cancel their own encounter (404 otherwise,
   * so other dentists' encounter ids can't be probed). encounter.cancel is
   * admin-only in the seeded roles, but a custom role may be granted it.
   *
   * The patient is still in the clinic, so in the same transaction the
   * appointment goes back to CHECKED_IN and its queue entry reopens; the
   * exam can then be started again (startEncounterForAppointment reopens
   * this encounter row — appointment_id is unique). Previously the
   * appointment was left IN_PROGRESS with no open encounter: it could be
   * neither restarted, completed nor cancelled. An encounter of an earlier
   * clinic day closes its appointment as LEFT instead.
   */
  async cancelEncounter(encounterId: string, reason: string, actor: JwtPayload) {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 10) {
      throw new BusinessRuleException(
        'Lý do hủy phiên khám phải có ít nhất 10 ký tự',
        HttpStatus.BAD_REQUEST,
        undefined,
        'ENCOUNTER_CANCEL_REASON_REQUIRED',
      );
    }
    const patientId = await this.prisma.$transaction(async tx => {
      await this.lockEncounter(tx, encounterId);
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter || (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub)) {
        throw new EncounterNotFoundException(encounterId);
      }
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
          cancelledReason: trimmed,
        },
      });
      // Only a visit of today goes back to the queue; one of an earlier
      // clinic day can no longer be seen, so it closes as LEFT (its queue
      // entry of that day stays closed) instead of an orphan CHECKED_IN.
      const todayStart = startOfClinicDay(clinicDateOnly());
      let appointmentStatus: 'CHECKED_IN' | 'LEFT' | 'unchanged' = 'unchanged';
      const backToQueue = await tx.appointment.updateMany({
        where: {
          id: encounter.appointmentId,
          status: 'IN_PROGRESS',
          startAt: { gte: todayStart },
        },
        data: { status: 'CHECKED_IN', updatedBy: actor.sub },
      });
      if (backToQueue.count > 0) {
        appointmentStatus = 'CHECKED_IN';
        await reopenStartedQueueEntry(tx, encounter.appointmentId, actor.sub);
      } else {
        const left = await tx.appointment.updateMany({
          where: {
            id: encounter.appointmentId,
            status: 'IN_PROGRESS',
            startAt: { lt: todayStart },
          },
          data: {
            status: 'LEFT',
            leftAt: new Date(),
            leftReason: PAST_DAY_ENCOUNTER_CANCELLED_REASON,
            updatedBy: actor.sub,
          },
        });
        if (left.count > 0) {
          appointmentStatus = 'LEFT';
          await closeQueueEntry(tx, encounter.appointmentId, 'LEFT', actor.sub);
        }
      }
      await tx.encounterAudit.create({
        data: {
          encounterId,
          action: 'CANCELLED',
          actorId: actor.sub,
          before: { status: encounter.status },
          after: {
            status: 'CANCELLED',
            reason: trimmed,
            appointmentStatus,
          },
        },
      });
      await this.audit.log({
        action: 'ENCOUNTER_CANCELLED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetType: 'encounter',
        targetId: encounterId,
        metadata: {
          appointmentId: encounter.appointmentId,
          patientId: encounter.patientId,
          reason: trimmed,
          appointmentReturnedToCheckIn: appointmentStatus === 'CHECKED_IN',
          ...(appointmentStatus === 'LEFT' ? { appointmentClosedAsLeft: true } : {}),
        },
      });
      return encounter.patientId;
    });
    this.emitClinicalDataChanged(patientId);
  }

  // ==========================================================================
  // Clinical note
  // ==========================================================================

  async upsertClinicalNote(encounterId: string, dto: UpsertClinicalNoteDto, actor: JwtPayload) {
    return this.withEditableEncounter(encounterId, actor, async tx => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
      });
      if (!encounter) throw new EncounterNotFoundException(encounterId);
      if (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub) {
        throw new EncounterNotFoundException(encounterId);
      }

      const lockedMessage =
        'Clinical note is locked because encounter is closed; only addendums allowed (BR-MR-007)';

      // BR-MR-007 was enforced only through the note's isLocked flag, but that
      // flag is a cache of "the encounter is closed" and can be false on a
      // closed encounter: closeEncounter() sets it with an updateMany that
      // matches nothing when no note row exists yet, and seeded/legacy rows
      // never went through that path at all. Observed on real data — an
      // encounter closed five days earlier whose note still read
      // isLocked: false, leaving the sealed record freely rewritable. The
      // encounter's own status is the source of truth, so check it too.
      if (encounter.status !== EncounterStatus.IN_PROGRESS) {
        throw new EncounterNotClosableException(lockedMessage);
      }

      // The lock check has to live in the WHERE clause of the write, not in a
      // separate read: closeEncounter() locks the note (isLocked: true) from
      // its own transaction, so a plain read-then-upsert lets an edit that was
      // in flight when the encounter closed land *after* the lock — silently
      // rewriting a clinical record that is supposed to be sealed, with no
      // addendum trail. The two actors need not be different people (a dentist
      // closing on one device while saving on another), but an admin closing
      // an encounter the dentist is still writing up is the common case.
      const guarded = await tx.clinicalNote.updateMany({
        where: { encounterId, isLocked: false },
        data: {
          ...(dto.chiefComplaint !== undefined && { chiefComplaint: dto.chiefComplaint }),
          ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
          ...(dto.treatmentPlan !== undefined && { treatmentPlan: dto.treatmentPlan }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          lastEditedBy: actor.sub,
        },
      });

      let note;
      if (guarded.count === 0) {
        // No unlocked row matched: either the note is locked, or it doesn't
        // exist yet and this is the first save for the encounter.
        const current = await tx.clinicalNote.findUnique({ where: { encounterId } });
        if (current?.isLocked) {
          throw new EncounterNotClosableException(lockedMessage);
        }
        note = await tx.clinicalNote.create({
          data: {
            encounterId,
            chiefComplaint: dto.chiefComplaint ?? null,
            diagnosis: dto.diagnosis ?? null,
            treatmentPlan: dto.treatmentPlan ?? null,
            notes: dto.notes ?? null,
            lastEditedBy: actor.sub,
          },
        });
      } else {
        note = await tx.clinicalNote.findUniqueOrThrow({ where: { encounterId } });
      }

      await this.audit.log({
        action: 'CLINICAL_NOTE_UPSERTED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetType: 'encounter',
        targetId: encounterId,
        metadata: { noteId: note.id },
      });

      return note;
    });
  }

  async addAddendum(encounterId: string, dto: AddAddendumDto, actor: JwtPayload) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { clinicalNote: true },
    });
    if (!encounter) throw new EncounterNotFoundException(encounterId);
    if (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub) {
      throw new EncounterNotFoundException(encounterId);
    }
    if (!encounter.clinicalNote) {
      throw new EncounterNotClosableException('No clinical note exists yet');
    }
    if (encounter.status !== EncounterStatus.IN_PROGRESS) {
      if (encounter.status !== EncounterStatus.COMPLETED || !encounter.closedAt) {
        throw new ForbiddenException('Addendums require an active or completed encounter');
      }
      // BR-MR-005: append corrections without modifying the sealed original note.
      if (Date.now() >= encounter.closedAt.getTime() + 30 * 24 * 60 * 60 * 1000) {
        throw new ForbiddenException('Addendum window expired');
      }
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
    this.emitClinicalDataChanged(encounter.patientId);

    return addendum;
  }

  // ==========================================================================
  // Treatments
  // ==========================================================================

  async createTreatment(encounterId: string, dto: CreateTreatmentDto, actor: JwtPayload) {
    return this.withEditableEncounter(encounterId, actor, async tx => {
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) throw new EncounterNotFoundException(encounterId);
      if (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub) {
        throw new EncounterNotFoundException(encounterId);
      }
      if (encounter.status !== EncounterStatus.IN_PROGRESS) {
        throw new EncounterNotClosableException(
          'Cannot add treatments to non-IN_PROGRESS encounter',
        );
      }

      // Determine next sequence
      const maxSeq = await tx.treatment.aggregate({
        where: { encounterId, deletedAt: null },
        _max: { sequence: true },
      });
      const sequence = (maxSeq._max.sequence ?? -1) + 1;

      // D6: a catalogue pick must name an active service; the free-text
      // procedure/price stay as sent (the form pre-fills them, staff may edit).
      if (dto.serviceId) {
        const service = await tx.service.findUnique({ where: { id: dto.serviceId } });
        if (!service || !service.isActive) {
          throw new BusinessRuleException(
            'Dịch vụ không tồn tại hoặc đã ngừng',
            HttpStatus.BAD_REQUEST,
            { serviceId: dto.serviceId },
            'SERVICE_INACTIVE',
          );
        }
      }

      const treatment = await (async () => {
        const t = await tx.treatment.create({
          data: {
            encounterId,
            serviceId: dto.serviceId ?? null,
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
      })();

      await this.audit.log({
        action: 'TREATMENT_CREATED',
        actorUserId: actor.sub,
        targetType: 'encounter',
        targetId: encounterId,
        metadata: { treatmentId: treatment.id, procedure: dto.procedure },
      });

      return treatment;
    });
  }

  async updateTreatment(
    encounterId: string,
    treatmentId: string,
    dto: UpdateTreatmentDto,
    actor: JwtPayload,
  ) {
    return this.withEditableEncounter(encounterId, actor, async tx => {
      const t = await tx.treatment.findUnique({
        where: { id: treatmentId },
        include: { encounter: { select: { dentistId: true } } },
      });
      if (!t || t.encounterId !== encounterId) throw new TreatmentNotInEncounterException();
      if (t.deletedAt) throw new TreatmentNotInEncounterException();
      if (this.isRowScopedDentist(actor) && t.encounter.dentistId !== actor.sub) {
        throw new TreatmentNotInEncounterException();
      }

      return tx.treatment.update({
        where: { id: treatmentId },
        data: {
          ...(dto.procedure !== undefined && { procedure: dto.procedure }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
          ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
        },
      });
    });
  }

  async deleteTreatment(encounterId: string, treatmentId: string, actor: JwtPayload) {
    return this.withEditableEncounter(encounterId, actor, async tx => {
      const t = await tx.treatment.findUnique({
        where: { id: treatmentId },
        include: { encounter: { select: { dentistId: true } } },
      });
      if (!t || t.encounterId !== encounterId) throw new TreatmentNotInEncounterException();
      if (this.isRowScopedDentist(actor) && t.encounter.dentistId !== actor.sub) {
        throw new TreatmentNotInEncounterException();
      }
      if (t.deletedAt) return; // idempotent

      await tx.treatment.update({
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
    });
  }

  // ==========================================================================
  // Prescription
  // ==========================================================================

  /**
   * Create the encounter's prescription, or replace it (header + every line)
   * while the encounter is IN_PROGRESS.
   *   - no row: create.
   *   - soft-deleted row (encounter_id is unique, so a new row can't be
   *     inserted): reuse it — this is a fresh prescription, so it gets the
   *     new author and lines.
   *   - active row: replace only when the caller echoes its `version`
   *     (the edit form); a plain create still gets 409 so a stale page can't
   *     silently overwrite a prescription it never saw.
   * Old lines are soft-deleted, never removed (BR-MR-006).
   * Every save is screened against the patient's recorded allergies.
   */
  async upsertPrescription(encounterId: string, dto: CreatePrescriptionDto, actor: JwtPayload) {
    return this.withEditableEncounter(encounterId, actor, async tx => {
      const encounter = await tx.encounter.findUnique({ where: { id: encounterId } });
      if (!encounter) throw new EncounterNotFoundException(encounterId);
      if (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub) {
        throw new EncounterNotFoundException(encounterId);
      }

      const existing = await tx.prescription.findUnique({ where: { encounterId } });
      const active = existing && !existing.deletedAt ? existing : null;
      if (active) {
        if (dto.version === undefined) throw new PrescriptionAlreadyExistsException();
        if (dto.version !== active.version) throw new PrescriptionVersionConflictException();
      }

      const patient = await tx.patient.findUnique({
        where: { id: encounter.patientId },
        select: { allergies: true },
      });
      const conflicts = findAllergyConflicts(dto.lines, readJsonStringArray(patient?.allergies));
      const overrideReason = dto.allergyOverrideReason?.trim() ?? '';
      if (conflicts.length > 0 && overrideReason.length < 10) {
        throw new PrescriptionAllergyConflictException(conflicts, overrideReason.length > 0);
      }

      const header = {
        diagnosis: dto.diagnosis ?? null,
        instructions: dto.instructions ?? null,
        followUpNote: dto.followUpNote ?? null,
        notes: dto.notes ?? null,
      };
      let prescription;
      if (existing) {
        await tx.prescriptionLine.updateMany({
          where: { prescriptionId: existing.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        prescription = await tx.prescription.update({
          where: { id: existing.id },
          data: {
            ...header,
            // createdAt keeps the original issue time (audit trail).
            ...(!active && { deletedAt: null, createdBy: actor.sub }),
            version: { increment: 1 },
          },
        });
      } else {
        prescription = await tx.prescription.create({
          data: { encounterId, ...header, createdBy: actor.sub },
        });
      }
      for (let i = 0; i < dto.lines.length; i++) {
        const line = dto.lines[i];
        await tx.prescriptionLine.create({
          data: {
            prescriptionId: prescription.id,
            sequence: i,
            drugName: line.drugName,
            dosage: line.dosage ?? '',
            frequency: line.frequency ?? '',
            duration: line.durationDays ? String(line.durationDays) : '',
            quantity: line.quantity ?? null,
            unit: line.unit ?? null,
            instructions: line.instructions ?? null,
          },
        });
      }

      await this.audit.log({
        action: active ? 'PRESCRIPTION_REPLACED' : 'PRESCRIPTION_CREATED',
        actorUserId: actor.sub,
        targetType: 'encounter',
        targetId: encounterId,
        metadata: {
          prescriptionId: prescription.id,
          lineCount: dto.lines.length,
          hasDiagnosis: !!dto.diagnosis,
          hasInstructions: !!dto.instructions,
          hasFollowUpNote: !!dto.followUpNote,
          ...(existing && !active && { reusedDeletedPrescription: true }),
        },
      });

      if (conflicts.length > 0) {
        await this.audit.log({
          action: 'PRESCRIPTION_ALLERGY_OVERRIDE',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'encounter',
          targetId: encounterId,
          metadata: {
            prescriptionId: prescription.id,
            patientId: encounter.patientId,
            reason: overrideReason,
            conflicts,
          },
        });
      }

      return prescription;
    });
  }

  /**
   * Re-screens the encounter's active prescription against the patient's
   * allergies as they are now. Pairs already overridden with a reason for
   * this prescription (PRESCRIPTION_ALLERGY_OVERRIDE audit) pass; any other
   * pair needs `reason` (≥ 10 chars) or the close is refused with 409.
   * Returns what to audit when the close overrides new pairs.
   */
  private async screenPrescriptionAtClose(
    tx: Prisma.TransactionClient,
    encounterId: string,
    patientId: string,
    reasonInput: string | undefined,
  ): Promise<{ prescriptionId: string; reason: string; conflicts: AllergyConflict[] } | null> {
    const prescription = await tx.prescription.findUnique({
      where: { encounterId },
      include: { lines: { where: { deletedAt: null }, orderBy: { sequence: 'asc' } } },
    });
    if (!prescription || prescription.deletedAt || prescription.lines.length === 0) return null;
    const patient = await tx.patient.findUnique({
      where: { id: patientId },
      select: { allergies: true },
    });
    const conflicts = findAllergyConflicts(
      prescription.lines,
      readJsonStringArray(patient?.allergies),
    );
    if (conflicts.length === 0) return null;

    const overrides = await tx.auditLog.findMany({
      where: {
        action: 'PRESCRIPTION_ALLERGY_OVERRIDE',
        targetType: 'encounter',
        targetId: encounterId,
      },
      select: { metadata: true },
    });
    const pairKey = (drugName: string, allergy: string) =>
      `${normalizeTerm(drugName)}|${normalizeTerm(allergy)}`;
    const overridden = new Set<string>();
    for (const row of overrides) {
      const meta = row.metadata as { prescriptionId?: unknown; conflicts?: unknown } | null;
      if (meta?.prescriptionId !== prescription.id || !Array.isArray(meta.conflicts)) continue;
      for (const c of meta.conflicts as Array<Partial<AllergyConflict>>) {
        if (typeof c?.drugName === 'string' && typeof c?.allergy === 'string') {
          overridden.add(pairKey(c.drugName, c.allergy));
        }
      }
    }
    const unresolved = conflicts.filter(c => !overridden.has(pairKey(c.drugName, c.allergy)));
    if (unresolved.length === 0) return null;

    const reason = reasonInput?.trim() ?? '';
    if (reason.length < 10) {
      throw new PrescriptionAllergyConflictException(unresolved, reason.length > 0);
    }
    return { prescriptionId: prescription.id, reason, conflicts: unresolved };
  }

  /**
   * Partial update of a prescription (PATCH semantics).
   *
   * Lines themselves are not edited here — callers replace the whole
   * prescription via the POST upsert path (with `version`). This method updates the
   * header-level fields (diagnosis, instructions, followUpNote, notes)
   * and bumps `version` for optimistic concurrency.
   */
  async updatePrescription(prescriptionId: string, dto: UpdatePrescriptionDto, actor: JwtPayload) {
    const parent = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!parent || parent.deletedAt) throw new EncounterNotFoundException(prescriptionId);
    return this.withEditableEncounter(parent.encounterId, actor, async tx => {
      const existing = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: { encounter: { select: { dentistId: true } } },
      });
      if (!existing || existing.deletedAt) {
        throw new EncounterNotFoundException(prescriptionId);
      }
      if (this.isRowScopedDentist(actor) && existing.encounter.dentistId !== actor.sub) {
        throw new EncounterNotFoundException(prescriptionId);
      }
      if (dto.version !== existing.version) throw new PrescriptionVersionConflictException();

      const updated = await tx.prescription.update({
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
        metadata: {
          encounterId: existing.encounterId,
          fields: Object.keys(dto).filter(k => k !== 'version'),
        },
      });

      return updated;
    });
  }

  /**
   * Soft-delete a prescription. Encounter-level link is preserved so the
   * audit trail and historical printing remain intact.
   */
  async deletePrescription(prescriptionId: string, actor: JwtPayload) {
    const parent = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!parent || parent.deletedAt) return;
    return this.withEditableEncounter(parent.encounterId, actor, async tx => {
      const existing = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: { encounter: { select: { dentistId: true } } },
      });
      if (!existing || existing.deletedAt) return; // idempotent
      if (this.isRowScopedDentist(actor) && existing.encounter.dentistId !== actor.sub) {
        // Row-scoped-out prescriptions are invisible to this actor, so
        // "delete" one is indistinguishable from it never existing —
        // matches the idempotent no-op above rather than leaking existence.
        return;
      }

      await tx.prescription.update({
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
    });
  }

  // ==========================================================================
  // Dental chart snapshot
  // ==========================================================================

  async snapshotDentalChart(encounterId: string, dto: SnapshotDentalChartDto, actor: JwtPayload) {
    return this.withEditableEncounter(encounterId, actor, async tx => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        include: { patient: { select: { dob: true, deletedAt: true } } },
      });
      if (!encounter) throw new EncounterNotFoundException(encounterId);
      // dental_chart.update is 🔒 (own, khi in_progress) per SPEC §7.1 —
      // unlike dental_chart.read (any patient the dentist may read, see
      // getLatestDentalChartForPatient), only the treating dentist may write
      // a snapshot for their own encounter.
      if (this.isRowScopedDentist(actor) && encounter.dentistId !== actor.sub) {
        throw new EncounterNotFoundException(encounterId);
      }
      if (encounter.patient.deletedAt) {
        throw new EncounterNotClosableException('Patient is deleted');
      }

      // BR-MR-012: patientType must match age band
      const minor = isMinor(new Date(encounter.patient.dob));
      const expected = minor ? 'CHILD' : 'ADULT';
      if (dto.patientType !== expected) {
        throw new DentalChartPatientMismatchException();
      }
      // Keys are FDI numbers. CHILD = mixed dentition (primary 51–85 plus
      // permanent 11–48); ADULT = permanent only.
      const invalidTeeth = Object.keys(dto.teeth ?? {}).filter(key => {
        const n = /^\d{2}$/.test(key) ? Number(key) : NaN;
        if (!isValidFdiToothNumber(n)) return true;
        return dto.patientType === 'ADULT' && n >= 50;
      });
      if (invalidTeeth.length > 0) {
        throw new DentalChartInvalidToothException(invalidTeeth, dto.patientType);
      }

      const existing = await tx.dentalChartSnapshot.findUnique({
        where: { encounterId },
      });
      if (existing) {
        // Overwrite but keep audit trail
        const updated = await tx.dentalChartSnapshot.update({
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
      return tx.dentalChartSnapshot.create({
        data: {
          encounterId,
          patientType: dto.patientType,
          teeth: dto.teeth as unknown as Prisma.InputJsonValue,
          snapshotBy: actor.sub,
        },
      });
    });
  }

  /**
   * Read the latest dental chart snapshot for a patient (across encounters).
   * A row-scoped dentist gets it only for a patient they may read
   * (dentistCanReadPatient) — same scope as the encounter history.
   */
  async getLatestDentalChartForPatient(patientId: string, actor: JwtPayload) {
    if (
      this.isRowScopedDentist(actor) &&
      !(await dentistCanReadPatient(this.prisma, patientId, actor.sub))
    ) {
      throw new BusinessRuleException('Không tìm thấy bệnh nhân', HttpStatus.NOT_FOUND);
    }
    const lastEncounter = await this.prisma.encounter.findFirst({
      where: { patientId, dentalChart: { isNot: null } },
      orderBy: { startedAt: 'desc' },
      include: { dentalChart: true },
    });
    return lastEncounter?.dentalChart ?? null;
  }
}
