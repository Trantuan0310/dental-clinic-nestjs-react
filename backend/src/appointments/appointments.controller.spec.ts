import { AppointmentsController } from './appointments.controller';
import { adminPayload, dentistPayload } from '../../test/helpers';

describe('AppointmentsController — legacy shift-registration cancel route (APPT-FU-07)', () => {
  const shiftRegistrations = { cancel: jest.fn().mockResolvedValue({ id: 'shift-1' }) };
  const controller = new AppointmentsController({} as any, shiftRegistrations as any, {} as any);

  afterEach(() => jest.clearAllMocks());

  it('delegates to the single ShiftRegistrationService.cancel implementation', async () => {
    const actor = dentistPayload('dentist-1');

    await expect(controller.cancelShift('shift-1', actor)).resolves.toEqual({
      data: { id: 'shift-1' },
    });
    expect(shiftRegistrations.cancel).toHaveBeenCalledWith('shift-1', 'dentist-1', false);
  });

  it('treats shift.cancel + shift.approve holders as admin, like /shifts/registrations', async () => {
    const actor = {
      ...adminPayload(),
      permissions: [...adminPayload().permissions, 'shift.cancel', 'shift.approve'],
    };

    await controller.cancelShift('shift-1', actor);

    expect(shiftRegistrations.cancel).toHaveBeenCalledWith('shift-1', actor.sub, true);
  });
});
