/**
 * A jest-mock of PrismaService. Every model exposes the common delegate methods
 * as jest.fn(); list methods default to `[]`, single-record methods to `null`.
 * `$transaction` resolves the array of promises it is given (or invokes a
 * callback with the mock) so service code that batches writes works unchanged.
 *
 * Tests tune behavior per-case with e.g.
 *   prisma.user.findFirst.mockResolvedValue(fakeUser)
 */

const MODELS = [
  'user',
  'session',
  'recoveryCode',
  'passwordResetToken',
  'emailVerificationToken',
  'apiKey',
  'webAuthnCredential',
  'server',
  'subUser',
  'gameTemplate',
  'gameCategory',
  'gameSwitchLog',
  'serverVariable',
  'allocation',
  'region',
  'subscription',
  'product',
  'price',
  'invoice',
  'payment',
  'paymentMethod',
  'auditLog',
  'globalAlert',
  'homepageAlert',
  'node',
  'nodeHeartbeat',
  'platformSetting',
  'role',
  'notification',
  'ticket',
  'ticketMessage',
  'ticketCategory',
  'cannedResponse',
  'coupon',
  'couponRedemption',
  'giftCard',
  'giftCardTransaction',
  'creditTransaction',
] as const;

type AnyFn = jest.Mock;

export interface PrismaModelMock {
  findUnique: AnyFn;
  findFirst: AnyFn;
  findFirstOrThrow: AnyFn;
  findMany: AnyFn;
  create: AnyFn;
  createMany: AnyFn;
  update: AnyFn;
  updateMany: AnyFn;
  upsert: AnyFn;
  delete: AnyFn;
  deleteMany: AnyFn;
  count: AnyFn;
}

export type PrismaMock = {
  [K in (typeof MODELS)[number]]: PrismaModelMock;
} & {
  $transaction: AnyFn;
  $queryRaw: AnyFn;
  $executeRaw: AnyFn;
  $connect: AnyFn;
  $disconnect: AnyFn;
};

function makeModelMock(): PrismaModelMock {
  return {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findFirstOrThrow: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  };
}

export function createPrismaMock(): PrismaMock {
  const mock = {} as PrismaMock;
  for (const m of MODELS) {
    (mock as Record<string, unknown>)[m] = makeModelMock();
  }

  mock.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaMock) => unknown)(mock);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
  mock.$queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  mock.$executeRaw = jest.fn().mockResolvedValue(0);
  mock.$connect = jest.fn().mockResolvedValue(undefined);
  mock.$disconnect = jest.fn().mockResolvedValue(undefined);

  return mock;
}

/** A queue double exposing the BullMQ `add` surface as a jest.fn(). */
export function createQueueMock(): { add: jest.Mock } {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}
