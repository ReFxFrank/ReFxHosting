import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ApiKeyWriteScopeInterceptor } from './api-key-write-scope.interceptor';

/**
 * Unit tests for the global API-key WRITE-scope ceiling. A READ-scoped key may
 * never drive a mutating request; WRITE/ADMIN keys and browser/JWT sessions are
 * unaffected; any key may issue safe (GET) requests.
 */
describe('ApiKeyWriteScopeInterceptor', () => {
  let interceptor: ApiKeyWriteScopeInterceptor;
  let handled: boolean;
  let next: CallHandler;

  beforeEach(() => {
    interceptor = new ApiKeyWriteScopeInterceptor();
    handled = false;
    next = {
      handle: () => {
        handled = true;
        return of('ok');
      },
    };
  });

  /** Minimal HTTP ExecutionContext for a given method + principal. */
  function ctx(method: string, user: unknown): ExecutionContext {
    const req = { method, user };
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it('rejects a READ-scoped key on a mutating (POST) request', () => {
    // The interceptor throws synchronously (before returning the observable),
    // which Nest turns into a 403.
    expect(() =>
      interceptor.intercept(ctx('POST', { id: 'u1', apiKeyScopes: ['READ'] }), next),
    ).toThrow(ForbiddenException);
    expect(handled).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects a READ-scoped key on %s',
    (method) => {
      expect(() =>
        interceptor.intercept(
          ctx(method, { id: 'u1', apiKeyScopes: ['READ'] }),
          next,
        ),
      ).toThrow(/write scope/);
    },
  );

  it('allows a WRITE-scoped key on a mutating (POST) request', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(ctx('POST', { id: 'u1', apiKeyScopes: ['WRITE'] }), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('allows an ADMIN-scoped key on a mutating (DELETE) request', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(ctx('DELETE', { id: 'u1', apiKeyScopes: ['ADMIN'] }), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('allows a JWT/browser session (no apiKeyScopes) on a mutating (POST) request', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(ctx('POST', { id: 'u1' }), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('allows any key on a safe (GET) request', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(ctx('GET', { id: 'u1', apiKeyScopes: ['READ'] }), next),
    );
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });

  it('passes through GraphQL contexts untouched', async () => {
    const gqlCtx = {
      getType: () => 'graphql',
    } as unknown as ExecutionContext;
    const result = await lastValueFrom(interceptor.intercept(gqlCtx, next));
    expect(result).toBe('ok');
    expect(handled).toBe(true);
  });
});
