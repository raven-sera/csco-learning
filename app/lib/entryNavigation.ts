import { BASE_PATH, localPathname } from './sitePaths';

// Only these local destinations may be resumed through the portal.
export function safeReturnPath(value: string | null, basePath = BASE_PATH): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/learning';
  try {
    const url = new URL(value, 'https://csco.invalid');
    const pathname = localPathname(url.pathname, basePath);
    if (url.origin !== 'https://csco.invalid' || !['/learning', '/schedule'].includes(pathname)) return '/learning';
    return pathname + url.search + url.hash;
  } catch { return '/learning'; }
}
export const PORTAL_ENTER_EVENT = 'csco:portal-enter';
export const STORAGE_WARNING_EVENT = 'csco:storage-warning';
