import { AvailabilityService, slotStepMinutes } from './availability.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';

/**
 * One slot grid for every list (audit round 3): online booking and
 * rescheduling (dayAvailability) and the front desk's search give the same
 * start times for the same service, dentist and day.
 */
describe('AvailabilityService slot grid', () => {
  const DATE = '2099-09-16';
  const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
  const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00+07:00`);
  let prisma: PrismaMockShape;
  let service: AvailabilityService;

  const day = (
    windows: Array<[string, string]>,
    bookings: Array<[string, string]> = [],
    timeOffs: Array<[Date, Date]> = [],
  ) => {
    (prisma.workingSchedule.findMany as jest.Mock).mockResolvedValue(
      windows.map(([s, e]) => ({ startTime: time(s), endTime: time(e), slotDurationMin: 30 })),
    );
    (prisma.shiftRegistration.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.scheduleOverride.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timeOff.findMany as jest.Mock).mockResolvedValue(
      timeOffs.map(([startAt, endAt]) => ({ startAt, endAt })),
    );
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue(
      bookings.map(([s, e], i) => ({ id: 'b' + i, startAt: at(s), endAt: at(e) })),
    );
  };

  /** A 90-minute service with 5' prep and 10' clean-up, as both paths see it. */
  const service90 = () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'dentist-1', fullName: 'BS A', dentistProfile: null },
    ]);
    (prisma.dentistService.findMany as jest.Mock).mockResolvedValue([
      {
        dentistId: 'dentist-1',
        durationMin: null,
        service: { defaultDurationMin: 90, bufferBeforeMin: 5, bufferAfterMin: 10 },
      },
    ]);
  };
  const online = async () =>
    (await service.dayAvailability('dentist-1', DATE, 90, { beforeMin: 5, afterMin: 10 }))
      .availableSlots;
  const frontDesk = async () =>
    (await service.search({ date: DATE, serviceId: 'svc-1' }))[0]?.availableSlots ?? [];

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AvailabilityService(prisma as any);
    delete process.env.SLOT_STEP_MIN;
  });
  afterEach(() => {
    delete process.env.SLOT_STEP_MIN;
    jest.clearAllMocks();
  });

  it('steps 15 minutes whatever the visit length: a 90-minute visit can start at 10:30', async () => {
    day([['08:00', '12:00']]);
    expect(await online()).toEqual([
      '08:00',
      '08:15',
      '08:30',
      '08:45',
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
      '10:15',
      '10:30',
    ]);
  });

  it('offers the time right after an earlier visit (08:30 after 08:00-08:30)', async () => {
    day([['08:00', '12:00']], [['08:00', '08:30']]);
    const res = await service.dayAvailability('dentist-1', DATE, 90);
    expect(res.availableSlots[0]).toBe('08:30');
    // With 5' prep the visit needs 08:25 free, so the grid's next time.
    expect((await online())[0]).toBe('08:45');
  });

  it('gives online booking and the front desk the same times for the same service', async () => {
    day(
      [
        ['08:00', '12:00'],
        ['13:30', '17:00'],
      ],
      [
        ['09:10', '09:55'],
        ['14:00', '14:30'],
      ],
    );
    service90();
    const fromSearch = await frontDesk();
    expect(fromSearch.length).toBeGreaterThan(0);
    expect(fromSearch).toEqual(await online());
  });

  it('starts at an off-grid window start, then keeps to round clock times', async () => {
    day([['08:10', '09:10']]);
    expect((await service.dayAvailability('dentist-1', DATE, 30)).availableSlots).toEqual([
      '08:10',
      '08:15',
      '08:30',
    ]);
  });

  it('follows SLOT_STEP_MIN, falling back to 15 for a bad value', async () => {
    process.env.SLOT_STEP_MIN = '30';
    expect(slotStepMinutes()).toBe(30);
    day([['08:00', '10:00']]);
    expect(await online()).toEqual(['08:00', '08:30']);
    process.env.SLOT_STEP_MIN = 'abc';
    expect(slotStepMinutes()).toBe(15);
    process.env.SLOT_STEP_MIN = '0';
    expect(slotStepMinutes()).toBe(15);
  });

  it('says a day with working hours is all time-off', async () => {
    day([['08:00', '12:00']], [], [[at('07:00'), at('13:00')]]);
    const res = await service.dayAvailability('dentist-1', DATE, 30);
    expect(res.availableSlots).toEqual([]);
    expect(res.blockedReason).toBe('TIME_OFF');
  });

  it('leaves the reason empty when the day is simply full', async () => {
    day([['08:00', '09:00']], [['08:00', '09:00']]);
    const res = await service.dayAvailability('dentist-1', DATE, 30);
    expect(res.availableSlots).toEqual([]);
    expect(res.blockedReason).toBeNull();
  });
});
