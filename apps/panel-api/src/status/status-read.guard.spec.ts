import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { StatusReadGuard, extractStatusToken } from './status-read.guard';
import { ApiKeyService } from '../auth/api-key.service';

/**
 * Unit tests for the bot-facing `GET /status/nodes` guard: 401 without a valid
 * token, 403 when a valid token lacks the status:read scope, pass-through when
 * it carries it. Token accepted as Authorization: Bearer or X-Api-Key.
 */
describe('StatusReadGuard', () => {
  function ctx(headers: Record<string, string>): ExecutionContext {
    const req: any = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  function guardWith(authenticate: jest.Mock): StatusReadGuard {
    return new StatusReadGuard({ authenticate } as unknown as ApiKeyService);
  }

  it('extracts the token from Authorization: Bearer and X-Api-Key', () => {
    expect(extractStatusToken({ headers: { authorization: 'Bearer refx_abc' } })).toBe(
      'refx_abc',
    );
    expect(extractStatusToken({ headers: { 'x-api-key': 'refx_xyz' } })).toBe('refx_xyz');
    expect(extractStatusToken({ headers: {} })).toBeNull();
  });

  it('401 when no token is presented', async () => {
    const guard = guardWith(jest.fn());
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('401 (propagated) when the token is invalid/revoked/expired', async () => {
    const authenticate = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('API key revoked'));
    const guard = guardWith(authenticate);
    await expect(
      guard.canActivate(ctx({ authorization: 'Bearer refx_dead' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('403 when a valid token lacks the status:read scope', async () => {
    const authenticate = jest.fn().mockResolvedValue({
      id: 'u1',
      apiKeyId: 'k1',
      apiKeyScopes: ['READ'],
    });
    const guard = guardWith(authenticate);
    await expect(
      guard.canActivate(ctx({ 'x-api-key': 'refx_readonly' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes and sets req.statusClient for a status:read token', async () => {
    const authenticate = jest.fn().mockResolvedValue({
      id: 'u1',
      apiKeyId: 'k1',
      apiKeyScopes: ['STATUS_READ'],
    });
    const guard = guardWith(authenticate);
    const req: any = { headers: { authorization: 'Bearer refx_status' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.statusClient).toEqual({ apiKeyId: 'k1' });
  });
});
