import { describe, expect, it, vi } from 'vitest';
import { origins, poolConfig, proxyTrust } from './config';
import { accountMailer } from './mail';

describe('deployment configuration fails closed', () => {
  it('validates every CORS origin, not only the first', () => {
    for (const value of ['', 'https://app.example,http://evil.example', 'https://app.example/path', '*', 'https://*.example', 'https://user:pass@app.example']) expect(() => origins({ NODE_ENV: 'production', CORS_ORIGIN: value })).toThrow();
    expect(origins({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example, https://staging.example' })).toEqual(['https://app.example', 'https://staging.example']);
  });
  it('verifies database TLS by default and prevents URL SSL overrides', () => {
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:password@db.example/nestwise' };
    expect(poolConfig(env).ssl).toEqual({ rejectUnauthorized: true });
    expect(() => poolConfig({ ...env, DATABASE_URL: env.DATABASE_URL + '?sslmode=no-verify' })).toThrow();
    expect(() => poolConfig({ ...env, DATABASE_SSL_MODE: 'disable' })).toThrow();
    expect(poolConfig({ ...env, DATABASE_SSL_MODE: 'disable', DATABASE_PRIVATE_NETWORK: 'true' }).ssl).toBe(false);
    for (const value of ['1', '51', 'NaN']) expect(() => poolConfig({ ...env, DATABASE_POOL_MAX: value })).toThrow();
    expect(() => poolConfig({})).toThrow();
  });
  it('does not blindly trust proxy headers', () => {
    expect(proxyTrust({})).toBe(false); const trust = proxyTrust({ TRUST_PROXY_HOPS: '1' });
    if (!trust) throw new Error('Expected proxy function'); expect(trust('127.0.0.1', 0)).toBe(true); expect(trust('127.0.0.1', 1)).toBe(false);
    expect(() => proxyTrust({ TRUST_PROXY_HOPS: 'true' })).toThrow();
  });
});
describe('account email delivery boundary', () => {
  const env = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'NestWise <care@example.test>', APP_WEB_URL: 'https://app.example.test' };
  const message = { email: 'recipient@example.test', purpose: 'reset' as const, token: 'a'.repeat(64), expiresMinutes: 30 };
  it('is unavailable unless explicitly configured and rejects incomplete setup', () => {
    expect(accountMailer({})).toBeUndefined();
    expect(() => accountMailer({ EMAIL_PROVIDER: 'smtp' })).toThrow();
    expect(() => accountMailer({ EMAIL_PROVIDER: 'resend' })).toThrow();
  });
  it('sends only security mail and keeps the code out of the URL', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'accepted' })));
    await accountMailer(env, send)!(message);
    const [url, request] = send.mock.calls[0]; expect(url).toBe('https://api.resend.com/emails');
    const payload = JSON.parse(request!.body as string);
    expect(payload.to).toEqual([message.email]); expect(payload.text).toContain('https://app.example.test/account?mode=reset');
    expect(payload.text).not.toContain('token='); expect(payload.text).toContain(message.token);
    expect(request!.signal).toBeInstanceOf(AbortSignal);
  });
  it('never reports success for rejection, timeout, or malformed acceptance', async () => {
    for (const response of [new Response('sensitive provider error', { status: 429 }), new Response('{}')]) {
      const send = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(accountMailer(env, send)!(message)).rejects.toThrow();
    }
    await expect(accountMailer(env, vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout')))!(message)).rejects.toThrow();
  });
});
