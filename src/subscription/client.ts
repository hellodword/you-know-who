export type SubscriptionTarget = 'shadowrocket' | 'sing-box-1.11' | 'sing-box-1.13' | 'mihomo';

const EXPLICIT_CLIENTS = new Map<string, SubscriptionTarget>([
  ['shadowrocket', 'shadowrocket'],
  ['sr', 'shadowrocket'],
  ['sfi', 'sing-box-1.11'],
  ['sfa', 'sing-box-1.13'],
  ['sing-box', 'sing-box-1.13'],
  ['singbox', 'sing-box-1.13'],
  ['sb', 'sing-box-1.13'],
  ['karing', 'sing-box-1.13'],
  ['mikubox', 'mihomo'],
  ['mihomo', 'mihomo'],
  ['clash-meta', 'mihomo'],
  ['clashmeta', 'mihomo'],
  ['meta', 'mihomo'],
  ['clash-verge', 'mihomo'],
  ['clashverge', 'mihomo'],
  ['flclash', 'mihomo'],
]);

export function detectClient(explicitClient?: string | null, userAgent?: string | null): SubscriptionTarget | null {
  const explicit = explicitClient?.trim().toLowerCase();
  if (explicit) {
    return EXPLICIT_CLIENTS.get(explicit) ?? null;
  }

  const ua = userAgent?.toLowerCase() ?? '';
  if (ua.includes('shadowrocket/')) {
    return 'shadowrocket';
  }
  if (ua.includes('sfi/')) {
    return 'sing-box-1.11';
  }
  if (ua.includes('sfa/') || ua.includes('karing/')) {
    return 'sing-box-1.13';
  }
  if (ua.includes('mikubox/')) {
    return 'mihomo';
  }
  if (ua.includes('sing-box') || ua.includes('singbox')) {
    return 'sing-box-1.13';
  }
  if (
    ua.includes('mihomo') ||
    ua.includes('clash.meta') ||
    ua.includes('clash-meta') ||
    ua.includes('clashmeta') ||
    ua.includes('clash-verge') ||
    ua.includes('flclash')
  ) {
    return 'mihomo';
  }

  return null;
}
