import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password-policy';

const errors = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body)).flatMap(e => Object.values(e.constraints ?? {}));

describe('password policy (one rule everywhere)', () => {
  const short = 'a1'.repeat(PASSWORD_MIN_LENGTH / 2).slice(0, PASSWORD_MIN_LENGTH - 1);
  const ok = 'a1'.repeat(PASSWORD_MIN_LENGTH / 2);
  const long = 'a1'.repeat(PASSWORD_MAX_LENGTH);

  it('login takes any non-empty password up to the maximum, so a short one is just wrong', () => {
    expect(errors(LoginDto, { email: 'a@b.vn', password: 'abc' })).toEqual([]);
    expect(errors(LoginDto, { email: 'a@b.vn', password: '' }).length).toBeGreaterThan(0);
    expect(errors(LoginDto, { email: 'a@b.vn', password: long }).length).toBeGreaterThan(0);
  });

  it.each([
    ['reset', ResetPasswordDto, { token: 't' }],
    ['change', ChangePasswordDto, { currentPassword: 'x' }],
  ])('%s uses the same length rule and message', (_n, cls, base) => {
    expect(errors(cls, { ...base, newPassword: ok })).toEqual([]);
    expect(errors(cls, { ...base, newPassword: short })).toContain(PASSWORD_LENGTH_MESSAGE);
    expect(errors(cls, { ...base, newPassword: long })).toContain(PASSWORD_LENGTH_MESSAGE);
  });
});
