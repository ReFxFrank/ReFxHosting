import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

/**
 * Admin-initiated credential management. The privilege guard is the key control:
 * staff may only manage credentials for STRICTLY LOWER-privileged accounts, and
 * never their own — preventing lateral takeover / privilege escalation.
 */
describe('AuthService admin password management', () => {
  let prisma: any;
  let svc: AuthService;

  const TARGET = (globalRole: string) => ({
    id: 'target-1',
    email: 't@e.com',
    firstName: 'T',
    globalRole,
  });

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ passwordHash: 'old' }),
        update: jest.fn().mockResolvedValue({}),
      },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      passwordResetToken: { create: jest.fn().mockResolvedValue({}) },
      passwordHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const crypto = { token: jest.fn(() => 'RAW'), hash: jest.fn((s: string) => `h(${s})`) };
    const email = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendPasswordChangedByAdmin: jest.fn().mockResolvedValue(undefined),
    };
    svc = new AuthService(prisma, new JwtService({}), config as any, crypto as any, email as any);
  });

  const support = { id: 'a', globalRole: 'SUPPORT' };
  const admin = { id: 'a', globalRole: 'ADMIN' };
  const owner = { id: 'o', globalRole: 'OWNER' };

  it('blocks managing an account at OR above the actor’s privilege', async () => {
    prisma.user.findFirst.mockResolvedValue(TARGET('ADMIN'));
    await expect(svc.adminSetPassword(support, 'target-1')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findFirst.mockResolvedValue(TARGET('ADMIN'));
    await expect(svc.adminSetPassword(admin, 'target-1')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findFirst.mockResolvedValue(TARGET('OWNER'));
    await expect(svc.adminSendPasswordReset(admin, 'target-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks managing your own account through this path', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...TARGET('CUSTOMER'), id: admin.id });
    await expect(svc.adminSetPassword(admin, admin.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sets a temporary password for a lower-privileged user (flag + revoke + notice)', async () => {
    prisma.user.findFirst.mockResolvedValue(TARGET('CUSTOMER'));
    const res = await svc.adminSetPassword(admin, 'target-1');
    // Strong generated password.
    expect(res.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{10,}$/);
    // mustChangePassword flag set + sessions revoked.
    const updateData = prisma.user.update.mock.calls[0][0].data;
    expect(updateData.mustChangePassword).toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });

  it('emails a reset link without exposing a password (send-reset path)', async () => {
    prisma.user.findFirst.mockResolvedValue(TARGET('ADMIN'));
    await svc.adminSendPasswordReset(owner, 'target-1');
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
  });
});
