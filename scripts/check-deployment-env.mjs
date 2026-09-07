// Run before web/native release exports. Public variables are embedded into the bundle.
if (!['staging', 'production'].includes(process.env.DEPLOY_ENV)) throw new Error('DEPLOY_ENV must be staging or production');
for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_URL']) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  const url = new URL(value);
  if (url.origin !== value || url.hostname.includes('*') || url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(`${key} must be an exact public HTTPS origin, without a trailing slash`);
}
