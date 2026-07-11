import { ReferralsService } from './referrals.service';
import { CreditReason } from '@prisma/client';

describe('ReferralsService', () => {
  let prisma: any;
  let credit: any;
  let settings: any;
  let svc: ReferralsService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      creditTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountMinor: 0 } }),
      },
    };
    credit = { adjust: jest.fn().mockResolvedValue({ balanceMinor: 500 }) };
    settings = {
      referralConfig: jest
        .fn()
        .mockResolvedValue({ enabled: true, rewardMinor: 500 }),
    };
    svc = new ReferralsService(prisma, credit, settings);
  });

  describe('rewardFirstPayment', () => {
    const REFERRED = {
      id: 'u-new',
      email: 'new@x.com',
      referredById: 'u-referrer',
      referralRewardedAt: null,
    };

    it('grants both sides once on the first real payment', async () => {
      prisma.user.findUnique.mockResolvedValue(REFERRED);
      await svc.rewardFirstPayment('u-new', 2000);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-new', referralRewardedAt: null },
        data: { referralRewardedAt: expect.any(Date) },
      });
      expect(credit.adjust).toHaveBeenCalledTimes(2);
      expect(credit.adjust).toHaveBeenCalledWith(
        'u-referrer',
        500,
        CreditReason.REFERRAL,
        expect.anything(),
      );
      expect(credit.adjust).toHaveBeenCalledWith(
        'u-new',
        500,
        CreditReason.REFERRAL,
        expect.anything(),
      );
    });

    it('is once-only: a lost atomic claim grants nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(REFERRED);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await svc.rewardFirstPayment('u-new', 2000);
      expect(credit.adjust).not.toHaveBeenCalled();
    });

    it('skips already-rewarded, unreferred, zero-total and disabled cases', async () => {
      // already rewarded
      prisma.user.findUnique.mockResolvedValue({
        ...REFERRED,
        referralRewardedAt: new Date(),
      });
      await svc.rewardFirstPayment('u-new', 2000);
      // unreferred
      prisma.user.findUnique.mockResolvedValue({
        ...REFERRED,
        referredById: null,
      });
      await svc.rewardFirstPayment('u-new', 2000);
      // $0 order (100% coupon)
      await svc.rewardFirstPayment('u-new', 0);
      // program disabled
      settings.referralConfig.mockResolvedValue({
        enabled: false,
        rewardMinor: 500,
      });
      prisma.user.findUnique.mockResolvedValue(REFERRED);
      await svc.rewardFirstPayment('u-new', 2000);
      expect(credit.adjust).not.toHaveBeenCalled();
    });

    it('never throws into settlement', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('db down'));
      await expect(svc.rewardFirstPayment('u-new', 2000)).resolves.toBeUndefined();
    });
  });

  describe('attachReferrer', () => {
    it('links a valid code once', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-referrer',
        deletedAt: null,
      });
      await svc.attachReferrer('u-new', 'abcd2345');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { referralCode: 'ABCD2345' },
        select: { id: true, deletedAt: true },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u-new', referredById: null },
        data: { referredById: 'u-referrer' },
      });
    });

    it('ignores unknown codes and self-referrals', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await svc.attachReferrer('u-new', 'NOPE1234');
      prisma.user.findUnique.mockResolvedValue({ id: 'u-new', deletedAt: null });
      await svc.attachReferrer('u-new', 'SELF1234');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  it('myReferral creates a code lazily and reports earnings', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', referralCode: null });
    prisma.user.update.mockResolvedValue({ id: 'u1', referralCode: 'ABCD2345' });
    prisma.user.count
      .mockResolvedValueOnce(3) // referred
      .mockResolvedValueOnce(2); // converted
    prisma.creditTransaction.aggregate.mockResolvedValue({
      _sum: { amountMinor: 1000 },
    });
    const res = await svc.myReferral('u1');
    expect(res.code).toBe('ABCD2345');
    expect(res.referredCount).toBe(3);
    expect(res.convertedCount).toBe(2);
    expect(res.earnedMinor).toBe(1000);
    expect(res.rewardMinor).toBe(500);
  });
});
