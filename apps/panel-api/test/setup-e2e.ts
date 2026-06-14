/**
 * Global setup for the e2e/integration suite.
 *
 * These tests boot Nest test modules with all external I/O mocked (Prisma,
 * Redis/BullMQ, the node agent, payment gateways), so NO real database, redis or
 * network is required. We pin the JWT secrets and a valid 64-hex SECRETS_ENC_KEY
 * up front so ConfigService/CryptoService behave deterministically.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
process.env.JWT_ACCESS_TTL = '900';
process.env.JWT_REFRESH_TTL = '2592000';
process.env.SECRETS_ENC_KEY = '0'.repeat(64);
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';

jest.setTimeout(30000);
