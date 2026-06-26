import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { PasswordChangeInterceptor } from './password-change.interceptor';
import { ALLOW_WHEN_PASSWORD_EXPIRED_KEY } from '../decorators/allow-when-password-expired.decorator';

/**
 * Unit tests for the global PasswordChangeInterceptor. It blocks every route for
 * a principal with `mustChangePassword=true` unless the handler/class is marked
 * @AllowWhenPasswordExpired().
 */
describe('PasswordChangeInterceptor', () => {
  let reflector: Reflector;
  let interceptor: PasswordChangeInterceptor;
  let handled: boolean;
  let next: CallHandler;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new PasswordChangeInterceptor(reflector);
    handled = false;
    next = {
      handle: () => {
        handled = true;
        return of('ok');
      },
    };
  });

  /** Minimal HTTP ExecutionContext carrying the request user. */
  function ctx(user: unknown): ExecutionContext {
    const req = { user };
    return {
      getType: () => 'http',
      getHandler: () => 'handlerRef',
      getClass: () => 'classRef',
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  function allow(value: boolean | undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(value);
  }

  it('throws PASSWORD_CHANGE_REQUIRED when the flag is set and the handler is NOT allowlisted', async () => {
    allow(undefined); // not marked @AllowWhenPasswordExpired()
    try {
      await lastValueFrom(
        interceptor.intercept(ctx({ id: 'u1', mustChangePassword: true }), next),
      );
      fail('expected ForbiddenException');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(body.statusCode).toBe(403);
    }
    expect(handled).toBe(false);
  });

  it('passes through when the flag is set but the handler IS allowlisted', async () => {
    allow(true); // marked @AllowWhenPasswordExpired()
    const result = await lastValueFrom(
      interceptor.intercept(ctx({ id: 'u1', mustChangePassword: true }), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('passes through when the flag is NOT set, regardless of the allowlist', async () => {
    allow(undefined);
    const result = await lastValueFrom(
      interceptor.intercept(ctx({ id: 'u1', mustChangePassword: false }), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('passes through when there is no authenticated user', async () => {
    allow(undefined);
    const result = await lastValueFrom(
      interceptor.intercept(ctx(undefined), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('reads the allowlist flag from handler + class metadata', async () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(true);
    await lastValueFrom(
      interceptor.intercept(ctx({ id: 'u1', mustChangePassword: true }), next),
    );
    expect(spy).toHaveBeenCalledWith(ALLOW_WHEN_PASSWORD_EXPIRED_KEY, [
      'handlerRef',
      'classRef',
    ]);
  });
});
