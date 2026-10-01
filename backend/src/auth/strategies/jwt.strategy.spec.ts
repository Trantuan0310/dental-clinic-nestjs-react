import { JwtStrategy } from './jwt.strategy';
import { createPrismaMock } from '../../../test/helpers/prisma-mock';

describe('JwtStrategy.validate', () => {
  const prev = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'x'.repeat(40);
  });
  afterAll(() => {
    process.env.JWT_SECRET = prev;
  });

  it('loads permissions only from roles that are not soft-deleted (A6-22)', async () => {
    const prisma = createPrismaMock();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-1',
      email: 'a@clinic.local',
      deactivatedAt: null,
      deletedAt: null,
      status: 'ACTIVE',
      userRoles: [{ role: { rolePermissions: [{ permission: { code: 'patient.read' } }] } }],
    });
    const strategy = new JwtStrategy(prisma as never);

    const result = await strategy.validate({} as never, { sub: 'u-1' } as never);

    expect(result.permissions).toEqual(['patient.read']);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          userRoles: expect.objectContaining({ where: { role: { deletedAt: null } } }),
        },
      }),
    );
  });
});
