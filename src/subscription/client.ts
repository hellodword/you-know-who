export type ClientType = 'shadowrocket' | 'sing-box';

const EXPLICIT_CLIENTS = new Map<string, ClientType>([
  ['shadowrocket', 'shadowrocket'],
  ['sr', 'shadowrocket'],
  ['sing-box', 'sing-box'],
  ['singbox', 'sing-box'],
  ['sb', 'sing-box'],
  ['sfa', 'sing-box'],
  ['sfi', 'sing-box'],
]);

export function detectClient(explicitClient?: string | null, userAgent?: string | null): ClientType | null {
  const explicit = explicitClient?.trim().toLowerCase();
  if (explicit) {
    return EXPLICIT_CLIENTS.get(explicit) ?? null;
  }

  const ua = userAgent?.toLowerCase() ?? '';
  if (ua.includes('shadowrocket/')) {
    return 'shadowrocket';
  }
  if (ua.includes('sfa/') || ua.includes('sfi/')) {
    return 'sing-box';
  }

  return null;
}
