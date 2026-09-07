import { createHash } from 'node:crypto';
import type { AccountMail } from './account';

/** Only account-security mail crosses this boundary. No child or care data is sent. */
export function accountMailer(env: Record<string, string | undefined> = process.env, send: typeof fetch = fetch): AccountMail | undefined {
  if (!env.EMAIL_PROVIDER || env.EMAIL_PROVIDER === 'disabled') return undefined;
  if (env.EMAIL_PROVIDER !== 'resend') throw new Error('EMAIL_PROVIDER must be disabled or resend');
  const { RESEND_API_KEY: key, EMAIL_FROM: from, APP_WEB_URL: web } = env;
  if (!key || !from || !web || /[\r\n]/.test(from)) throw new Error('Resend requires RESEND_API_KEY, EMAIL_FROM, APP_WEB_URL');
  const base = new URL(web);
  if (base.origin !== web || base.hostname.includes('*') || base.protocol !== 'https:') throw new Error('APP_WEB_URL must be an exact HTTPS origin');
  return async message => {
    const link = new URL('/account', base);
    // The token is entered from the email; it never reaches hosting access logs, referrers or browser URL history.
    link.searchParams.set('mode', message.purpose);
    const response = await send('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': createHash('sha256').update(message.token).digest('hex') },
      body: JSON.stringify({ from, to: [message.email], subject: message.purpose === 'verify' ? 'Verify your NestWise email' : 'Reset your NestWise password',
        text: `Open ${link.href}\n\nEnter this code: ${message.token}\n\nIt expires in ${message.expiresMinutes} minutes and can be used once. If you did not request this, ignore this email.` }),
    });
    if (!response.ok) throw Object.assign(new Error('Email delivery is temporarily unavailable. Please try again.'), { statusCode: 503 });
    const result = await response.json() as { id?: unknown };
    if (typeof result.id !== 'string' || !result.id) throw Object.assign(new Error('Email provider did not confirm acceptance.'), { statusCode: 503 });
  };
}
