import { AppointmentsController } from './appointments.controller';
import { adminPayload, dentistPayload } from '../../test/helpers';
import { REQUIRED_PERMISSIONS_KEY } from '../common/guards/permissions.guard';

describe('AppointmentsController — start-encounter permission (migration 027)', () => {
  it('requires encounter.start only; appointment.check_in no longer opens an exam', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      AppointmentsController.prototype.startEncounter,
    );
    expect(required).toEqual(['encounter.start']);
  });
});

describe('AppointmentsController — undo routes', () => {
  it('undoing a check-in needs check-in rights; undoing a no-show needs no-show rights', () => {
    const required = (handler: unknown) =>
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler as object);
    expect(required(AppointmentsController.prototype.undoCheckIn)).toEqual([
      'appointment.check_in',
    ]);
    expect(required(AppointmentsController.prototype.undoNoShow)).toEqual(['appointment.no_show']);
  });

  it('delegates with the body and the caller', async () => {
    const appointments = {
      undoCheckIn: jest.fn().mockResolvedValue({ id: 'a-1', status: 'SCHEDULED' }),
      undoNoShow: jest.fn().mockResolvedValue({ id: 'a-1', status: 'CONFIRMED' }),
    };
    const controller = new AppointmentsController(appointments as any, {} as any, {} as any);
    const actor = adminPayload();
    const dto = { reason: 'Check-in nhầm' };

    await expect(controller.undoCheckIn('a-1', dto, actor)).resolves.toEqual({
      data: { id: 'a-1', status: 'SCHEDULED' },
    });
    await controller.undoNoShow('a-1', dto, actor);
    expect(appointments.undoCheckIn).toHaveBeenCalledWith('a-1', dto, actor);
    expect(appointments.undoNoShow).toHaveBeenCalledWith('a-1', dto, actor);
  });
});

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
