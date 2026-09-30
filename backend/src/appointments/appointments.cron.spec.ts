import { AppointmentsCron } from './appointments.cron';

describe('AppointmentsCron', () => {
  const appointments = {
    closeStaleCheckIns: jest.fn(),
    autoMarkNoShow: jest.fn(),
    autoCancelPastPendingShifts: jest.fn(),
  };
  const cron = new AppointmentsCron(appointments as any);

  afterEach(() => jest.clearAllMocks());

  it('catches up on the end-of-day close at startup (a missed 00:15 run)', async () => {
    appointments.closeStaleCheckIns.mockResolvedValue({
      appointments: 1,
      failed: 0,
      queueEntries: 0,
    });

    await cron.onApplicationBootstrap();

    expect(appointments.closeStaleCheckIns).toHaveBeenCalledTimes(1);
  });

  it('never blocks startup when the catch-up fails', async () => {
    appointments.closeStaleCheckIns.mockRejectedValue(new Error('db down'));

    await expect(cron.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
