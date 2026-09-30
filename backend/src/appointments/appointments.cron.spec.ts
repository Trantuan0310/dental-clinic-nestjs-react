import { AppointmentsCron } from './appointments.cron';

describe('AppointmentsCron', () => {
  const appointments = {
    closeStaleCheckIns: jest.fn(),
    autoMarkNoShow: jest.fn(),
    autoCancelPastPendingShifts: jest.fn(),
  };
  const cron = new AppointmentsCron(appointments as any);

  afterEach(() => jest.clearAllMocks());

  it('catches up on the end-of-day close at startup (a missed 00:15 run) without waiting on it', () => {
    let finish!: () => void;
    appointments.closeStaleCheckIns.mockReturnValue(new Promise<void>(r => (finish = r)));

    expect(cron.onApplicationBootstrap()).toBeUndefined();

    expect(appointments.closeStaleCheckIns).toHaveBeenCalledTimes(1);
    finish();
  });

  it('swallows a failed catch-up (logged, never an unhandled rejection)', async () => {
    appointments.closeStaleCheckIns.mockRejectedValue(new Error('db down'));

    await expect(cron.closeStaleCheckIns()).resolves.toBeUndefined();
  });
});
