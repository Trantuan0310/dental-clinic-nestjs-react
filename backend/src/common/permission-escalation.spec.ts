import { assertActorHolds, assertActorOutranks } from './permission-escalation';

type Row = { permission: { code: string }; role?: { code: string } };

/** A db whose rolePermission.findMany answers per user id. */
function makeDb(byUser: Record<string, Row[]>) {
  return {
    rolePermission: {
      findMany: jest.fn(async ({ where }: any) => byUser[where.role.userRoles.some.userId] ?? []),
    },
  } as any;
}
const rows = (role: string, codes: string[]): Row[] =>
  codes.map(code => ({ permission: { code }, role: { code: role } }));

const DENTIST_ONLY = ['treatment.write', 'dental_chart.write', 'prescription.write'];

describe('BR-ADM-001 permission escalation', () => {
  it('lets the system clinic_admin hand out clinical permissions it does not hold itself', async () => {
    // The seeded admin has no clinical write codes, yet must create dentists.
    const db = makeDb({ admin: rows('clinic_admin', ['user.update', 'employee.update']) });
    await expect(assertActorHolds(db, 'admin', DENTIST_ONLY)).resolves.toBeUndefined();
  });

  it('lets the system clinic_admin manage a dentist account', async () => {
    const db = makeDb({
      admin: rows('clinic_admin', ['user.update']),
      dentist: rows('dentist', DENTIST_ONLY),
    });
    await expect(assertActorOutranks(db, 'admin', 'dentist')).resolves.toBeUndefined();
  });

  it('stops a custom role from granting codes it lacks', async () => {
    const db = makeDb({ manager: rows('office_manager', ['user.update', 'user.read']) });
    await expect(
      assertActorHolds(db, 'manager', ['user.update', 'role.upsert']),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'PERMISSION_ESCALATION' }),
    });
  });

  it('stops a custom role from acting on an account that holds more than it does', async () => {
    const db = makeDb({
      manager: rows('office_manager', ['user.update']),
      dentist: rows('dentist', DENTIST_ONLY),
    });
    await expect(assertActorOutranks(db, 'manager', 'dentist')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'PERMISSION_ESCALATION' }),
    });
  });
});
