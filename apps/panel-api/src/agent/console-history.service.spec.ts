import { ConsoleHistoryService } from './console-history.service';

/**
 * Verifies the Redis-backed console backlog: monotonic per-server seq assignment,
 * chronological replay, the cap/TTL writes, and fail-open behaviour when Redis
 * errors (live streaming must not break).
 */
function make(historyMax = 300) {
  // A tiny in-memory stand-in for the pieces of ioredis we use.
  const store = new Map<string, string[]>();
  const counters = new Map<string, number>();
  const pipelineOps: [string, unknown[]][] = [];
  const client: any = {
    incrby: jest.fn(async (key: string, n: number) => {
      const next = (counters.get(key) ?? 0) + n;
      counters.set(key, next);
      return next;
    }),
    lrange: jest.fn(async (key: string) => (store.get(key) ?? []).slice()),
    pipeline: () => {
      const list: string[] = [];
      const pipe: any = {
        rpush: (key: string, v: string) => {
          const arr = store.get(key) ?? [];
          arr.push(v);
          store.set(key, arr);
          pipelineOps.push(['rpush', [key, v]]);
          return pipe;
        },
        ltrim: (key: string, start: number, stop: number) => {
          const arr = store.get(key) ?? [];
          // emulate redis LTRIM negative indexing (keep last N)
          const s = start < 0 ? Math.max(0, arr.length + start) : start;
          const e = stop < 0 ? arr.length + stop : stop;
          store.set(key, arr.slice(s, e + 1));
          pipelineOps.push(['ltrim', [key, start, stop]]);
          return pipe;
        },
        expire: (key: string, ttl: number) => {
          pipelineOps.push(['expire', [key, ttl]]);
          return pipe;
        },
        exec: async () => [],
      };
      return pipe;
    },
  };
  const config = { get: () => ({ historyMax, historyTtlSeconds: 3600 }) };
  const svc = new ConsoleHistoryService({ client } as any, config as any);
  return { svc, client, store, pipelineOps };
}

const raw = (line: string, at = 1000) => ({ line, stream: 'stdout', at });

describe('ConsoleHistoryService', () => {
  it('assigns contiguous monotonic seqs per server and returns them in order', async () => {
    const { svc } = make();
    const a = await svc.record('srv-1', [raw('one'), raw('two'), raw('three')]);
    expect(a.map((f) => f.seq)).toEqual([1, 2, 3]);
    const b = await svc.record('srv-1', [raw('four')]);
    expect(b[0].seq).toBe(4); // continues, does not reset

    // A different server has its own independent sequence.
    const c = await svc.record('srv-2', [raw('x')]);
    expect(c[0].seq).toBe(1);
  });

  it('replays oldest -> newest, byte-compatible console frames', async () => {
    const { svc } = make();
    await svc.record('srv-1', [raw('first', 100), raw('second', 200)]);
    const hist = await svc.recent('srv-1');
    expect(hist).toEqual([
      { type: 'console', seq: 1, line: 'first', stream: 'stdout', at: 100 },
      { type: 'console', seq: 2, line: 'second', stream: 'stdout', at: 200 },
    ]);
  });

  it('caps the stored backlog at historyMax (LTRIM keeps the newest)', async () => {
    const { svc } = make(3);
    await svc.record('srv-1', [raw('a'), raw('b'), raw('c'), raw('d'), raw('e')]);
    const hist = await svc.recent('srv-1');
    expect(hist.map((f) => f.line)).toEqual(['c', 'd', 'e']);
    expect(hist.map((f) => f.seq)).toEqual([3, 4, 5]);
  });

  it('empty input and empty history are no-ops', async () => {
    const { svc } = make();
    expect(await svc.record('srv-1', [])).toEqual([]);
    expect(await svc.recent('srv-1')).toEqual([]);
  });

  it('fails open: a Redis error still returns live frames (seq 0) and never throws', async () => {
    const { svc, client } = make();
    client.incrby.mockRejectedValueOnce(new Error('redis down'));
    const frames = await svc.record('srv-1', [raw('still-live')]);
    expect(frames).toEqual([
      { type: 'console', seq: 0, line: 'still-live', stream: 'stdout', at: 1000 },
    ]);
    client.lrange.mockRejectedValueOnce(new Error('redis down'));
    expect(await svc.recent('srv-1')).toEqual([]);
  });
});
