import { ValidationPipe } from '@nestjs/common';
import { IsEmail, IsInt, IsString, Max, MinLength } from 'class-validator';
import { validationExceptionFactory, translateConstraint } from './validation-messages';

class Dto {
  @IsString() @MinLength(2) fullName!: string;
  @IsEmail() email!: string;
  @IsInt() @Max(10) quantity!: number;
  @MinLength(5, { message: 'Lý do cần ít nhất 5 ký tự' }) reason!: string;
  @IsString() weirdField!: string;
}

describe('validation messages in Vietnamese', () => {
  const pipe = new ValidationPipe({ exceptionFactory: validationExceptionFactory });
  const messages = async (body: object) => {
    try {
      await pipe.transform(body, { type: 'body', metatype: Dto });
      return [];
    } catch (e) {
      return (e as { getResponse(): { message: string[] } }).getResponse().message;
    }
  };

  it('rewrites class-validator defaults with a readable field name', async () => {
    const out = await messages({
      fullName: 'A',
      email: 'x',
      quantity: 20,
      reason: 'abcdef',
      weirdField: 'ok',
    });
    expect(out).toEqual(
      expect.arrayContaining([
        'Họ và tên cần ít nhất 2 ký tự',
        'Email không đúng định dạng',
        'Số lượng không được lớn hơn 10',
      ]),
    );
    expect(out.join(' ')).not.toMatch(/must|should/);
  });

  it('keeps a message the DTO already wrote, and names unknown fields', async () => {
    const out = await messages({ fullName: 'An', email: 'a@b.vn', quantity: 1, reason: 'abc' });
    expect(out).toEqual(['Lý do cần ít nhất 5 ký tự', 'Trường “weirdField” phải là chữ']);
    expect(translateConstraint('fullName', 'isNotEmpty', 'fullName should not be empty')).toBe(
      'Vui lòng nhập họ và tên',
    );
  });
});
