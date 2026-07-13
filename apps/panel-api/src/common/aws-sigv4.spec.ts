import { signv4, uriEncode, amzDateNow, EMPTY_PAYLOAD_SHA256 } from './aws-sigv4';

/**
 * The load-bearing test: AWS's published SigV4 "get-vanilla" vector. If our
 * canonical-request assembly, string-to-sign, and signing-key derivation are
 * correct, we reproduce AWS's expected signature exactly. This is what lets us
 * trust the signer against real R2 without a live round-trip in CI.
 */
describe('signv4', () => {
  it('matches the AWS get-vanilla test vector', () => {
    const auth = signv4({
      method: 'GET',
      path: '/',
      query: {},
      headers: {
        Host: 'example.amazonaws.com',
        'X-Amz-Date': '20150830T123600Z',
      },
      // The vanilla vector signs an empty payload but does NOT include the
      // x-amz-content-sha256 header, so it isn't in `headers` above.
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: 'us-east-1',
      service: 'service',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      amzDate: '20150830T123600Z',
    });

    expect(auth).toContain(
      'Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request',
    );
    expect(auth).toContain('SignedHeaders=host;x-amz-date');
    expect(auth).toContain(
      'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('sorts query params and headers into canonical order', () => {
    // get-vanilla-query-order-key vector shape: two params sign deterministically.
    const auth = signv4({
      method: 'GET',
      path: '/',
      query: { Param2: 'value2', Param1: 'value1' },
      headers: {
        Host: 'example.amazonaws.com',
        'X-Amz-Date': '20150830T123600Z',
      },
      payloadHash: EMPTY_PAYLOAD_SHA256,
      region: 'us-east-1',
      service: 'service',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      amzDate: '20150830T123600Z',
    });
    expect(auth).toContain(
      'Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500',
    );
  });

  describe('uriEncode', () => {
    it('leaves RFC3986 unreserved chars untouched', () => {
      expect(uriEncode('AZaz09-_.~')).toBe('AZaz09-_.~');
    });
    it('percent-encodes reserved chars uppercase', () => {
      expect(uriEncode('a b/c')).toBe('a%20b%2Fc');
      expect(uriEncode('a b/c', false)).toBe('a%20b/c');
    });
    it('encodes UTF-8 multibyte correctly', () => {
      expect(uriEncode('é')).toBe('%C3%A9');
    });
  });

  it('formats amz date in SigV4 basic form', () => {
    expect(amzDateNow(new Date('2026-07-13T05:33:16.123Z'))).toBe(
      '20260713T053316Z',
    );
  });
});
