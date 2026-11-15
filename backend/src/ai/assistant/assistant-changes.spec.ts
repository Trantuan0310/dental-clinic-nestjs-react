import { validate } from 'class-validator';
import { ConfirmAppointmentChangeDto } from '../dto/chat.dto';
import { RefBook, toolsFor, type ToolContext } from './assistant-tools';

const actor = {
  sub: 'desk',
  email: 'desk@test.invalid',
  permissions: ['appointment.read.any', 'appointment.cancel', 'appointment.update'],
};
describe('assistant change tool boundary', () => {
  it('advertises changes only with the matching mutation permission', () => {
    const readOnly = toolsFor({ ...actor, permissions: ['appointment.read.own'] });
    expect(readOnly.some(t => t.name.startsWith('propose_'))).toBe(false);
    const cancelOnly = toolsFor({ ...actor, permissions: ['appointment.cancel'] });
    expect(cancelOnly.map(t => t.name)).toEqual(['propose_cancel_appointment']);
    const updateOnly = toolsFor({ ...actor, permissions: ['appointment.update'] });
    expect(updateOnly.map(t => t.name)).toEqual(['propose_reschedule_appointment']);
  });
  it.each(['cancel_appointment', 'reschedule_appointment'] as const)(
    'shows a %s card without returning identity or confirming it',
    async type => {
      const proposeChange = jest
        .fn()
        .mockResolvedValue({
          type,
          payload: { proposalId: 'proposal' },
          view: {
            patientRef: '',
            dentistName: 'Dentist',
            startAt: '2099-12-01T02:00:00Z',
            reason: 'Patient requested',
          },
        });
      const ctx = {
        actor,
        refs: new RefBook(),
        actions: [],
        proposeChange,
        services: {
          appointments: {
            getById: jest
              .fn()
              .mockResolvedValue({ patient: { id: 'patient', fullName: 'Private name' } }),
          },
        },
      } as unknown as ToolContext;
      const result = await toolsFor(actor)
        .find(t => t.name === `propose_${type}`)!
        .run({ appointmentId: 'appt', reason: 'Patient requested' }, ctx);
      expect(result).toEqual(expect.objectContaining({ status: 'waiting_for_user_confirmation' }));
      expect(JSON.stringify(result)).not.toContain('Private name');
      expect(ctx.actions).toHaveLength(1);
      expect(ctx.actions[0].view.patientRef).toBe('P1');
      expect(ctx.refs.learnedNames).toEqual({ P1: 'Private name' });
      expect(proposeChange).toHaveBeenCalledWith(type, {
        appointmentId: 'appt',
        reason: 'Patient requested',
      });
    },
  );
  it('requires a UUID proposal ID at the HTTP boundary', async () => {
    expect(
      await validate(Object.assign(new ConfirmAppointmentChangeDto(), { proposalId: 'tampered' })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        Object.assign(new ConfirmAppointmentChangeDto(), {
          proposalId: '11111111-1111-4111-8111-111111111111',
        }),
      ),
    ).toHaveLength(0);
  });
});
