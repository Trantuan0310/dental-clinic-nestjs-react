import { createPrismaMock } from '../../test/helpers/prisma-mock';
import {
  appointmentLinkHash,
  issueAppointmentLink,
  resolveAppointmentLink,
} from './appointment-link-access';
import { AppointmentLinksService } from './appointment-links.service';
import { redactPatientLinkUrl } from '../common/redact-url';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppointmentLinkCancelDto, AppointmentLinkRescheduleDto } from './dto/appointment-link.dto';

describe('Appointment links', () => {
  const NOW = new Date('2026-11-09T01:00:00Z');
  const token = 'a'.repeat(43);
  const target = '2026-11-11T03:00:00.000Z';
  let db: any;
  let appt: any;
  let link: any;
  let service: AppointmentLinksService;
  let appointments: any;
  let availability: any;
  let booking: any;
  let audit: any;
  let events: any;
  const actor = {
    sub: 'staff',
    email: 'desk@example.test',
    permissions: ['appointment.read.any', 'appointment.update'],
  };
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    process.env.BOOKING_HOLD_MINUTES = '120';
    db = createPrismaMock();
    appt = {
      id: 'appointment',
      patientId: 'patient',
      dentistId: 'dentist',
      startAt: new Date('2026-11-10T03:00:00Z'),
      endAt: new Date('2026-11-10T03:30:00Z'),
      status: 'SCHEDULED',
      deletedAt: null,
      updatedAt: NOW,
      patient: { deletedAt: null },
      confirmedByPatient: false,
      confirmedAt: null,
      bufferBeforeMin: 5,
      bufferAfterMin: 10,
      rescheduleCount: 0,
      dentist: { fullName: 'Dentist' },
      services: [{ serviceName: 'Cleaning' }],
      rescheduleRequests: [],
    };
    link = {
      id: 'link',
      appointmentId: appt.id,
      patientId: appt.patientId,
      tokenHash: appointmentLinkHash(token),
      expiresAt: appt.startAt,
      appointment: appt,
    };
    db.appointmentLink.findUnique.mockImplementation(async () => link);
    db.appointment.findUnique.mockImplementation(async () => appt);
    db.appointment.findUniqueOrThrow.mockImplementation(async () => appt);
    db.appointment.updateMany.mockImplementation(async ({ data }: any) => {
      Object.assign(appt, data);
      return { count: 1 };
    });
    db.appointmentService.findMany.mockResolvedValue([]);
    db.clinicClosure.findMany.mockResolvedValue([]);
    db.appointment.findMany.mockResolvedValue([]);
    db.appointmentLinkRescheduleRequest.findFirst.mockResolvedValue(null);
    db.appointmentLinkRescheduleRequest.create.mockImplementation(async ({ data }: any) => {
      const row = { id: 'request', status: 'PENDING', createdAt: NOW, ...data };
      appt.rescheduleRequests = [row];
      return row;
    });
    db.appointmentLinkRescheduleRequest.update.mockImplementation(async ({ data }: any) => ({
      id: 'request',
      ...data,
    }));
    appointments = {
      validateDentist: jest.fn(),
      planVisit: jest.fn().mockResolvedValue(null),
      ensurePatientFree: jest.fn(),
      reschedule: jest.fn().mockResolvedValue({
        startAt: new Date(target),
        dentistId: appt.dentistId,
      }),
    };
    availability = {
      checkSlot: jest.fn().mockResolvedValue(null),
      loadDay: jest.fn().mockResolvedValue({
        windows: [
          { start: new Date('2026-11-11T02:00:00Z'), end: new Date('2026-11-11T05:00:00Z') },
        ],
        bookings: [],
        blocked: [],
        closedAllDay: false,
      }),
    };
    booking = { heldIntervals: jest.fn().mockResolvedValue([]) };
    audit = { log: jest.fn() };
    events = { emit: jest.fn() };
    service = new AppointmentLinksService(db, audit, appointments, availability, booking, events);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.BOOKING_HOLD_MINUTES;
  });

  it('issues 32 random bytes, binds the patient and persists only SHA-256 until the visit starts', async () => {
    const raw = (await issueAppointmentLink(db, appt.id))!;
    expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    expect(db.appointmentLink.create).toHaveBeenCalledWith({
      data: {
        appointmentId: appt.id,
        patientId: appt.patientId,
        tokenHash: appointmentLinkHash(raw),
        expiresAt: appt.startAt,
      },
    });
    expect(JSON.stringify(db.appointmentLink.create.mock.calls)).not.toContain(raw);
  });

  it('resolves a shared A1/A3 appointment identity without the patient profile or token hash', async () => {
    const resolved = await resolveAppointmentLink(db, token);
    expect(resolved).toMatchObject({ id: appt.id, patientId: appt.patientId });
    expect(resolved).not.toHaveProperty('patient');
    expect(resolved).not.toHaveProperty('tokenHash');
    expect(db.appointmentLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: appointmentLinkHash(token) },
      }),
    );
    expect(db.appointmentLink.update).toHaveBeenCalledWith({
      where: { id: 'link' },
      data: { lastUsedAt: NOW },
    });
  });

  it.each(['bad', 'a'.repeat(1000), '../../patient', 'a'.repeat(42)])(
    'rejects malformed tokens before querying: %s',
    async value => {
      await expect(resolveAppointmentLink(db, value)).rejects.toMatchObject({ status: 404 });
      expect(db.appointmentLink.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([
    'missing',
    'expired',
    'started',
    'deleted',
    'patient-deleted',
    'reassigned',
    'cancelled',
    'checked-in',
  ])('uses the same generic denial for %s', async scenario => {
    if (scenario === 'missing') link = null;
    if (scenario === 'expired') link.expiresAt = NOW;
    if (scenario === 'started') appt.startAt = NOW;
    if (scenario === 'deleted') appt.deletedAt = NOW;
    if (scenario === 'patient-deleted') appt.patient.deletedAt = NOW;
    if (scenario === 'reassigned') appt.patientId = 'another-patient';
    if (scenario === 'cancelled') appt.status = 'CANCELLED';
    if (scenario === 'checked-in') appt.status = 'CHECKED_IN';
    await expect(resolveAppointmentLink(db, token)).rejects.toMatchObject({
      status: 404,
      message: 'Liên kết không hợp lệ hoặc đã hết hạn',
    });
    expect(db.appointmentLink.update).not.toHaveBeenCalled();
  });

  it('returns only visit details and allowed actions publicly', async () => {
    const value = await service.get(token);
    expect(db.appointment.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: appt.id, patientId: appt.patientId },
        include: expect.objectContaining({
          rescheduleRequests: expect.objectContaining({ where: { patientId: appt.patientId } }),
        }),
      }),
    );
    expect(value).toMatchObject({
      dentist: { fullName: 'Dentist' },
      services: [{ name: 'Cleaning' }],
      canConfirm: true,
    });
    for (const key of ['patient', 'patientId', 'dentistId', 'id', 'notes', 'tokenHash'])
      expect(value).not.toHaveProperty(key);
  });

  it('confirms once with a patient actor and a transactional audit', async () => {
    expect((await service.confirm(token)).confirmedByPatient).toBe(true);
    await service.confirm(token);
    expect(db.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(appt).toMatchObject({ status: 'CONFIRMED', confirmedAt: NOW, confirmedBy: null });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPOINTMENT_CONFIRMED_BY_PATIENT',
        targetId: appt.id,
      }),
      db,
    );
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('rejects stale writes instead of overwriting a staff update', async () => {
    db.appointment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.confirm(token)).rejects.toMatchObject({ status: 409 });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('creates a held request without moving or confirming the original appointment', async () => {
    const oldStart = appt.startAt;
    const result = await service.reschedule(token, { startAt: target, note: 'Please move' });
    expect(appt.startAt).toEqual(oldStart);
    expect(appt.status).toBe('SCHEDULED');
    expect(result.rescheduleRequest).toMatchObject({
      status: 'PENDING',
      requestedStartAt: new Date(target),
      requestedEndAt: new Date('2026-11-11T03:30:00Z'),
      holdUntil: new Date(NOW.getTime() + 120 * 60000),
    });
    expect(availability.checkSlot).toHaveBeenCalledWith(
      appt.dentistId,
      new Date(target),
      expect.any(Date),
      expect.objectContaining({
        db,
        excludeAppointmentId: appt.id,
        buffers: { beforeMin: 5, afterMin: 10 },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESCHEDULE_REQUESTED' }),
      db,
    );
    expect(appointments.reschedule).not.toHaveBeenCalled();
  });

  it('supports a note-only request without inventing a slot hold', async () => {
    const value = await service.reschedule(token, { note: 'Please call me' });
    expect(value.rescheduleRequest).toMatchObject({
      requestedStartAt: null,
      requestedEndAt: null,
      holdUntil: null,
    });
    expect(availability.checkSlot).not.toHaveBeenCalled();
    await expect(service.reschedule(token, {})).rejects.toMatchObject({ status: 400 });
  });

  it('rejects unavailable, online-held and patient-overlapping times', async () => {
    availability.checkSlot.mockResolvedValueOnce({ message: 'Busy' });
    await expect(service.reschedule(token, { startAt: target })).rejects.toMatchObject({
      status: 409,
    });
    booking.heldIntervals.mockResolvedValueOnce([
      { start: new Date(target).getTime(), end: new Date(target).getTime() + 3600000 },
    ]);
    await expect(service.reschedule(token, { startAt: target })).rejects.toMatchObject({
      status: 409,
    });
    appointments.ensurePatientFree.mockRejectedValueOnce(new Error('patient busy'));
    await expect(service.reschedule(token, { startAt: target })).rejects.toThrow('patient busy');
    expect(db.appointmentLinkRescheduleRequest.create).not.toHaveBeenCalled();
  });

  it('does not multiply pending requests on retries', async () => {
    await service.reschedule(token, { startAt: target });
    db.appointmentLinkRescheduleRequest.findFirst.mockResolvedValue(appt.rescheduleRequests[0]);
    await service.reschedule(token, { startAt: target });
    expect(db.appointmentLinkRescheduleRequest.create).toHaveBeenCalledTimes(1);
    await expect(service.reschedule(token, { note: 'Different request' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('releases an expired pending request before replacing it', async () => {
    await service.reschedule(token, { startAt: target });
    const old = appt.rescheduleRequests[0];
    old.holdUntil = NOW;
    db.appointmentLinkRescheduleRequest.findFirst.mockResolvedValue(old);
    await service.reschedule(token, { startAt: target });
    expect(db.appointmentLinkRescheduleRequest.update).toHaveBeenCalledWith({
      where: { id: old.id },
      data: { status: 'CANCELLED', holdUntil: null },
    });
  });

  it('cancels before the configured cutoff, frees requests and preserves online booking reporting', async () => {
    const value = await service.cancel(token, { reason: 'Unable to attend' });
    expect(value.status).toBe('CANCELLED');
    expect(db.appointmentLinkRescheduleRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED', holdUntil: null } }),
    );
    expect(db.bookingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appointmentId: appt.id },
        data: expect.objectContaining({ closeReason: 'PATIENT_CANCELLED_VISIT' }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'appointment.cancelled',
      expect.objectContaining({ cancelledBy: null }),
    );
  });

  it('refuses late cancellation and a fourth patient reschedule', async () => {
    appt.startAt = new Date(NOW.getTime() + 3600000);
    await expect(service.cancel(token, {})).rejects.toMatchObject({ status: 400 });
    appt.rescheduleCount = 3;
    await expect(service.reschedule(token, { startAt: target })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('lists actual free slots only and validates real calendar dates', async () => {
    const result = await service.slots(token, '2026-11-11');
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0]).toEqual({
      startAt: new Date('2026-11-11T02:00:00Z'),
      endAt: new Date('2026-11-11T02:30:00Z'),
    });
    await expect(service.slots(token, '2026-02-30')).rejects.toMatchObject({ status: 400 });
    await expect(service.slots(token, '2099-01-01')).rejects.toMatchObject({ status: 400 });
  });

  function pending(overrides = {}) {
    const row = {
      id: 'request',
      appointmentId: appt.id,
      patientId: appt.patientId,
      dentistId: appt.dentistId,
      originalStartAt: appt.startAt,
      originalEndAt: appt.endAt,
      requestedStartAt: new Date(target),
      note: null,
      status: 'PENDING',
      holdUntil: new Date(NOW.getTime() + 3600000),
      ...overrides,
    };
    db.appointmentLinkRescheduleRequest.findUnique.mockResolvedValue(row);
    db.appointmentLinkRescheduleRequest.findUniqueOrThrow.mockResolvedValue(row);
    return row;
  }

  it('approves in the same transaction using existing reschedule rules, then emits after commit', async () => {
    pending();
    const result = await service.approve('request', {}, actor);
    expect(result.status).toBe('APPROVED');
    expect(appointments.reschedule).toHaveBeenCalledWith(
      appt.id,
      expect.objectContaining({
        newStartsAt: target,
        rescheduleCount: 0,
        updatedAt: NOW.toISOString(),
      }),
      actor,
      db,
    );
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it.each(['expired', 'processed', 'moved', 'reassigned', 'cancelled', 'note-only'])(
    'blocks approval of a %s request',
    async kind => {
      const row = pending();
      if (kind === 'expired') row.holdUntil = NOW;
      if (kind === 'processed') row.status = 'APPROVED';
      if (kind === 'moved') row.originalStartAt = NOW;
      if (kind === 'reassigned') row.patientId = 'another-patient';
      if (kind === 'cancelled') appt.status = 'CANCELLED';
      if (kind === 'note-only') {
        row.requestedStartAt = null as any;
        row.holdUntil = null as any;
      }
      await expect(service.approve('request', {}, actor)).rejects.toMatchObject({
        status: kind === 'note-only' ? 400 : 409,
      });
      expect(appointments.reschedule).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it('denies dentist-scoped access to the clinic request list and approval', async () => {
    const own = { ...actor, permissions: ['appointment.read.own', 'appointment.update'] };
    await expect(service.listRequests(own)).rejects.toMatchObject({ status: 403 });
    await expect(service.approve('request', {}, own)).rejects.toMatchObject({ status: 403 });
  });

  it('validates timezone, minute precision, text length and NUL bytes at the boundary', async () => {
    for (const body of [
      { startAt: '2026-11-11T10:00' },
      { startAt: '2026-11-11T03:00:01Z' },
      { startAt: '2026-02-30T03:00:00Z' },
      { note: 'x'.repeat(1001) },
      { note: '\u0000' },
    ]) {
      expect(
        (await validate(plainToInstance(AppointmentLinkRescheduleDto, body))).length,
      ).toBeGreaterThan(0);
    }
    expect(
      (await validate(plainToInstance(AppointmentLinkCancelDto, { reason: '\u0000' }))).length,
    ).toBeGreaterThan(0);
  });

  it('redacts public API, patient page and mock email bearer URLs', () => {
    for (const url of [
      `/api/v1/public/appointment-links/${token}/confirm`,
      `<a href="https://clinic.test/lich-hen/${token}">Visit</a>`,
    ]) {
      expect(redactPatientLinkUrl(url)).not.toContain(token);
      expect(redactPatientLinkUrl(url)).toContain('[redacted]');
    }
  });
});
