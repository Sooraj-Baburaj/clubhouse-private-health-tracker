import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, configure, get, NetworkError } from '../src/http';

const respond = (status: number, body: string) => configure({ fetchImpl: (async () => new Response(body, { status })) as typeof fetch });
afterEach(() => configure({ fetchImpl: undefined }));

describe('http client error mapping', () => {
  it('treats proxy and gateway answers as unreachable', async () => {
    for (const [status, body] of [[500, ''], [502, '<html>Bad gateway</html>'], [504, 'timeout']] as const) {
      respond(status, body);
      await expect(get('/me')).rejects.toBeInstanceOf(NetworkError);
    }
  });

  it('keeps API problem responses as ApiError with their code', async () => {
    respond(401, JSON.stringify({ code: 'invalid_credentials', title: 'Nope', status: 401 }));
    const err = await get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('invalid_credentials');
  });

  it('reports a failed fetch as unreachable', async () => {
    configure({ fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch });
    await expect(get('/me')).rejects.toBeInstanceOf(NetworkError);
  });
});
