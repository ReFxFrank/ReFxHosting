import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditQueryDto } from './audit-query.dto';

// Direct vet of class-validator (0.15) + class-transformer against a real DTO,
// independent of the Nest e2e harness. Mirrors the global ValidationPipe options.
async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(AuditQueryDto, payload, {
    enableImplicitConversion: true,
  });
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

const propsWithErrors = (errs: { property: string }[]) =>
  errs.map((e) => e.property);

describe('AuditQueryDto validation (class-validator 0.15)', () => {
  it('accepts a valid query', async () => {
    const errs = await errorsFor({
      actorId: '018f9d3a-0000-7000-8000-000000000000', // v7
      targetType: 'Server',
      action: 'server.power.start',
    });
    expect(errs).toHaveLength(0);
  });

  it('accepts empty input (every filter is optional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejects a non-v7 UUID for actorId (@IsUUID("7"))', async () => {
    // A v4 UUID must fail the version-specific check.
    const errs = await errorsFor({
      actorId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(propsWithErrors(errs)).toContain('actorId');
  });

  it('rejects an over-long targetType (@MaxLength 64)', async () => {
    const errs = await errorsFor({ targetType: 'x'.repeat(65) });
    expect(propsWithErrors(errs)).toContain('targetType');
  });

  it('coerces an ISO string to Date for `from` (@Type + implicit conversion)', async () => {
    const errs = await errorsFor({ from: '2026-06-24T00:00:00.000Z' });
    expect(propsWithErrors(errs)).not.toContain('from');
  });
});
