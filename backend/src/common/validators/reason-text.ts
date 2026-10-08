import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';

/**
 * A required free-text reason, trimmed first (a reason of spaces is no
 * reason, A3-18) and reported with ONE message: a missing reason used to
 * get "required", "too short" and "too long" at once (A5-23).
 */
export function ReasonText(min: number, max: number, label = 'Lý do'): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    ValidateBy({
      name: 'reasonText',
      validator: {
        validate: value => typeof value === 'string' && value.length >= min && value.length <= max,
        defaultMessage: args => {
          const value = args?.value;
          if (typeof value !== 'string' || value.length === 0) {
            return `Vui lòng nhập ${label.toLowerCase()}`;
          }
          return value.length < min
            ? `${label} cần ít nhất ${min} ký tự`
            : `${label} tối đa ${max} ký tự`;
        },
      },
    }),
  );
}
