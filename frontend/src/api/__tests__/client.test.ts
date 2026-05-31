import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('api client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses VITE_API_URL in development when provided', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.example.test');

    const { apiClient } = await import('../client');

    expect(apiClient.defaults.baseURL).toBe('http://api.example.test');
  });

  it('logs outgoing requests in request interceptor', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { apiClient } = await import('../client');
    const requestHandlers = (apiClient.interceptors.request as any).handlers as Array<{ fulfilled: (config: any) => any }>;
    const handler = requestHandlers[0].fulfilled;

    const config = await handler({ method: 'get', url: '/api/test', headers: {} } as any);

    expect(logSpy).toHaveBeenCalledWith('[API] GET /api/test');
    expect(config).toMatchObject({ method: 'get', url: '/api/test' });
  });

  it('passes through successful responses', async () => {
    const { apiClient } = await import('../client');
    const responseHandlers = (apiClient.interceptors.response as any).handlers as Array<{ fulfilled: (response: any) => any; rejected: (error: any) => Promise<never> }>;
    const handler = responseHandlers[0].fulfilled;
    const response = { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: {} };

    expect(await handler(response)).toBe(response);
  });

  it('transforms error responses into Error objects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { apiClient } = await import('../client');
    const responseHandlers = (apiClient.interceptors.response as any).handlers as Array<{ fulfilled: (response: any) => any; rejected: (error: any) => Promise<never> }>;
    const handler = responseHandlers[0].rejected;

    await expect(
      handler({ response: { data: { detail: 'Boom' } }, message: 'fallback' }),
    ).rejects.toThrow('Boom');

    expect(errorSpy).toHaveBeenCalledWith('[API Error]', 'Boom');
  });
});
