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

  it('parses per-object regardless of field order (R2 vs AWS)', async () => {
    // R2 can emit Size BEFORE LastModified. An order-assuming parser pairs the
    // small LATEST pointer's key with the big dump's size (the real bug). Each
    // object's fields must be read from within its own <Contents> block.
    const xml =
      '<?xml version="1.0"?><ListBucketResult>' +
      '<Contents><Key>panel-postgres/LATEST</Key><Size>40</Size><LastModified>2026-07-13T06:46:00.000Z</LastModified><ETag>"a"</ETag></Contents>' +
      '<Contents><Key>panel-postgres/dump.dump.enc</Key><Size>138703136</Size><LastModified>2026-07-13T06:45:00.000Z</LastModified><ETag>"b"</ETag></Contents>' +
      '<IsTruncated>false</IsTruncated></ListBucketResult>';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(xml, { status: 200 }));
    const res = await listObjects(CFG, 'panel-postgres/');
    expect(res.objects).toEqual([
      { key: 'panel-postgres/LATEST', size: 40, lastModified: '2026-07-13T06:46:00.000Z' },
      { key: 'panel-postgres/dump.dump.enc', size: 138703136, lastModified: '2026-07-13T06:45:00.000Z' },
    ]);
    expect(res.totalBytes).toBe(138703176);
  });

  it('handles an empty bucket', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(page([]), { status: 200 }));
    const res = await listObjects(CFG, 'panel-postgres/');
    expect(res.objects).toEqual([]);
    expect(res.totalBytes).toBe(0);
  });

  it('surfaces the R2 error code and status on a non-2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>',
          { status: 403 },
        ),
      );
    await expect(listObjects(CFG, 'panel-postgres/')).rejects.toThrow(
      /HTTP 403 — AccessDenied: Access Denied/,
    );
  });
});
