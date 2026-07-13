import { listObjects } from './s3-lite';

/**
 * The network is mocked; what we verify is the XML parsing, size summation,
 * and continuation-token pagination — the parts that would silently
 * under-count storage if wrong.
 */
const CFG = {
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'refx-db-backups',
  accessKey: 'AK',
  secretKey: 'SK',
  usePathStyle: true,
};

function page(objects: { key: string; size: number }[], nextToken?: string) {
  const contents = objects
    .map(
      (o) =>
        `<Contents><Key>${o.key}</Key><LastModified>2026-07-13T05:33:16.000Z</LastModified><Size>${o.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
    )
    .join('');
  return (
    `<?xml version="1.0"?><ListBucketResult>${contents}` +
    `<IsTruncated>${nextToken ? 'true' : 'false'}</IsTruncated>` +
    (nextToken
      ? `<NextContinuationToken>${nextToken}</NextContinuationToken>`
      : '') +
    `</ListBucketResult>`
  );
}

describe('listObjects', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sums sizes and returns objects from a single page', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        page([
          { key: 'panel-postgres/a.dump.enc', size: 100 },
          { key: 'panel-postgres/b.dump.enc', size: 250 },
          { key: 'panel-postgres/LATEST', size: 40 },
        ]),
        { status: 200 },
      ),
    );
    const res = await listObjects(CFG, 'panel-postgres/');
    expect(res.objects).toHaveLength(3);
    expect(res.totalBytes).toBe(390);
  });

  it('follows continuation tokens across pages', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(page([{ key: 'a.dump.enc', size: 1000 }], 'TOKEN2'), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(page([{ key: 'b.dump.enc', size: 2000 }]), {
          status: 200,
        }),
      );
    const res = await listObjects(CFG, 'panel-postgres/');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.totalBytes).toBe(3000);
    expect(res.objects.map((o) => o.key)).toEqual(['a.dump.enc', 'b.dump.enc']);
  });

  it('handles an empty bucket', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(page([]), { status: 200 }));
    const res = await listObjects(CFG, 'panel-postgres/');
    expect(res.objects).toEqual([]);
    expect(res.totalBytes).toBe(0);
  });

  it('throws with context on a non-2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('<Error><Code>AccessDenied</Code></Error>', {
          status: 403,
        }),
      );
    await expect(listObjects(CFG, 'panel-postgres/')).rejects.toThrow(
      /S3 list 403/,
    );
  });
});
