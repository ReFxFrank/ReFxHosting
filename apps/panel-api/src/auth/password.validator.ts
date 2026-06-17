import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, Matches } from 'class-validator';

/**
 * Shared strong-password policy for every place a user sets a password
 * (register, password reset, change password). Enforced server-side (the
 * authority); the web mirrors it for UX only.
 *
 * Requires 10–128 chars with at least one lowercase, uppercase, number and
 * symbol. One @Matches per rule so the validation message names the exact
 * missing requirement instead of a single opaque "weak password".
 */
export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(128, { message: 'Password must be at most 128 characters' }),
    Matches(/.{10,}/, { message: 'Password must be at least 10 characters' }),
    Matches(/[a-z]/, { message: 'Password must include a lowercase letter' }),
    Matches(/[A-Z]/, { message: 'Password must include an uppercase letter' }),
    Matches(/[0-9]/, { message: 'Password must include a number' }),
    Matches(/[^A-Za-z0-9]/, { message: 'Password must include a symbol' }),
  );
}
