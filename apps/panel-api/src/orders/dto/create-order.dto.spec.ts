import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto';

/**
 * P0-B regression: the storefront sends `expressBackups` and `attribution`, and
 * the global pipe uses `forbidNonWhitelisted`. Before the fix these fields were
 * absent from the DTO, so any attributed/referral or express-backup order was
 * rejected with a 400. These tests run the REAL global ValidationPipe config
 * (see apps/panel-api/src/main.ts) against the exact payload shapes the web app
 * emits.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const meta = { type: 'body', metatype: CreateOrderDto } as any;
const U = '00000000-0000-4000-8000-000000000001';

const base = {
  productId: U,
  priceId: U,
  templateId: U,
  name: 'My server',
  hardwareTierId: U,
};

describe('CreateOrderDto validation (P0-B)', () => {
  it('accepts an ordinary order (no attribution, no express backups)', async () => {
    const out = await pipe.transform({ ...base }, meta);
    expect(out).toBeInstanceOf(CreateOrderDto);
    expect(out.expressBackups).toBeUndefined();
  });

  it('accepts an attributed / referral order', async () => {
    const out = await pipe.transform(
      {
        ...base,
        attribution: {
          source: 'google',
          medium: 'cpc',
          campaign: 'launch',
          ref: 'FRIEND10',
          landing: '/minecraft-server-hosting',
          referrer: 'https://example.com',
        },
      },
      meta,
    );
    expect(out.attribution?.source).toBe('google');
    expect(out.attribution?.ref).toBe('FRIEND10');
  });

  it('accepts an express-backups order', async () => {
    const out = await pipe.transform({ ...base, expressBackups: true }, meta);
    expect(out.expressBackups).toBe(true);
  });

  it('accepts a combined attributed + express-backups order (full storefront payload)', async () => {
    const out = await pipe.transform(
      { ...base, expressBackups: true, attribution: { ref: 'ABC123' } },
      meta,
    );
    expect(out.expressBackups).toBe(true);
    expect(out.attribution?.ref).toBe('ABC123');
  });

  it('rejects an unknown top-level field (forbidNonWhitelisted preserved)', async () => {
    await expect(
      pipe.transform({ ...base, isAdmin: true } as any, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('strictly whitelists attribution keys — unknown key is rejected', async () => {
    await expect(
      pipe.transform(
        { ...base, attribution: { source: 'x', evilKey: 'drop tables' } } as any,
        meta,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // The production pipe uses transformOptions.enableImplicitConversion, so a
  // primitive of the wrong type on a KNOWN key is coerced to the declared type
  // rather than rejected (this is the platform-wide pipe contract, not specific
  // to these fields). What must NOT be relaxed is the key whitelist (above).
  it('coerces a numeric attribution value to string (implicit conversion)', async () => {
    const out = await pipe.transform(
      { ...base, attribution: { source: 123 } } as any,
      meta,
    );
    expect(out.attribution?.source).toBe('123');
  });

  it('coerces a stringy expressBackups to boolean (implicit conversion)', async () => {
    const out = await pipe.transform(
      { ...base, expressBackups: 'yes' } as any,
      meta,
    );
    expect(typeof out.expressBackups).toBe('boolean');
  });
});
