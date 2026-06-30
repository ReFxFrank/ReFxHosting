import request from 'supertest';
import { Controller, Get, Query } from '@nestjs/common';
import { buildTestApp, PREFIX, type TestAppHandles } from './utils/test-app';
import { ListTicketsQueryDto } from '../src/support/dto/list-tickets-query.dto';
import { Public } from '../src/common/decorators/public.decorator';

/**
 * Regression for the ticket-filter 400 bug: binding state/priority/mine as bare
 * `@Query('state')` alongside `@Query() PaginationDto` made the global
 * forbidNonWhitelisted pipe reject the whole request, so every state filter
 * (notably "Archived") returned empty and archived tickets looked deleted.
 * Folding them into ListTicketsQueryDto (extends PaginationDto) whitelists them.
 */
@Controller('tmp-tickets')
class TmpTicketsController {
  @Public()
  @Get()
  list(@Query() q: ListTicketsQueryDto) {
    return { state: q.state, priority: q.priority, mine: q.mine === 'true', page: q.page };
  }
}

describe('Ticket list filters (e2e regression)', () => {
  let h: TestAppHandles;
  beforeAll(async () => {
    h = await buildTestApp({ controllers: [TmpTicketsController] });
  });
  afterAll(async () => {
    await h.close();
  });

  it('accepts ?state=ARCHIVED (was 400 "property state should not exist")', async () => {
    const res = await request(h.app.getHttpServer()).get(
      `${PREFIX}/tmp-tickets?state=ARCHIVED&priority=HIGH&mine=true&page=2`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      state: 'ARCHIVED',
      priority: 'HIGH',
      mine: true,
      page: 2,
    });
  });

  it('still 400s a bogus state enum value', async () => {
    const res = await request(h.app.getHttpServer()).get(
      `${PREFIX}/tmp-tickets?state=NONSENSE`,
    );
    expect(res.status).toBe(400);
  });
});
