import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_PASSWORD_EXPIRED_KEY = 'allowWhenPasswordExpired';

/**
 * Opts a handler (or controller) out of the global PasswordChangeInterceptor.
 *
 * A user with `mustChangePassword=true` (an admin-set temporary password) is
 * otherwise blocked from EVERY authenticated route with a 403
 * `PASSWORD_CHANGE_REQUIRED`. Mark the handful of routes the user must still be
 * able to reach to set a new password / sign out (change-password, me, logout,
 * refresh) with this decorator.
 */
export const AllowWhenPasswordExpired = () =>
  SetMetadata(ALLOW_WHEN_PASSWORD_EXPIRED_KEY, true);
