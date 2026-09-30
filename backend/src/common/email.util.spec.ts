import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../auth/dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UpdateUserRolesDto } from '../users/dto/update-user-roles.dto';
import { LinkAccountDto } from '../staff/dto/staff.dto';
import { normalizeEmail } from './email.util';

describe('login email normalisation', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  BS.An@Clinic.VN ')).toBe('bs.an@clinic.vn');
  });

  it.each([
    ['LoginDto', LoginDto, { email: ' Admin@Clinic.Local ', password: 'secret1' }],
    ['CreateUserDto', CreateUserDto, { email: 'New@X.com', fullName: 'New' }],
    ['UpdateUserDto', UpdateUserDto, { email: 'New@X.com' }],
    ['LinkAccountDto', LinkAccountDto, { loginEmail: 'New@X.com' }],
  ])('%s stores the email lowercased and still validates it', async (_name, cls, body) => {
    const dto = plainToInstance(cls as new () => object, body) as Record<string, unknown>;
    expect(await validate(dto)).toEqual([]);
    const value = (dto.email ?? dto.loginEmail) as string;
    expect(value).toBe(value.trim().toLowerCase());
  });
});

describe('UpdateUserRolesDto', () => {
  it('accepts UUID v7 role ids (uuid_generate_v7)', async () => {
    const dto = plainToInstance(UpdateUserRolesDto, {
      roleIds: ['0199a3b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b'],
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects an empty role list and non-UUID ids', async () => {
    expect(await validate(plainToInstance(UpdateUserRolesDto, { roleIds: [] }))).toHaveLength(1);
    expect(
      await validate(plainToInstance(UpdateUserRolesDto, { roleIds: ['not-a-uuid'] })),
    ).toHaveLength(1);
  });
});
