import sbTemplate from '../sing-box-1.11.json';
import { EnvConfigError } from './errors';
import { matchExpandedRule, type ExpandedRule, type Hy2Rule, type VmessRule } from './rules';

export type SingboxOutbound = Record<string, unknown> & {
  tag: string;
  type: string;
};

interface SingboxEnv {
  WARP_IPV6?: string;
  WARP_PRIVATE_KEY?: string;
  DASHBOARD_PATH?: string;
}

interface MutableSingboxConfig {
  outbounds?: Array<Record<string, unknown>>;
  endpoints?: Array<Record<string, unknown> & { address?: unknown[]; private_key?: string }>;
  experimental?: {
    clash_api?: {
      external_controller?: string;
      external_ui?: string;
      secret?: string;
    };
  };
}

export function renderSingboxOutbounds(expandedRules: ExpandedRule[]): SingboxOutbound[] {
  return expandedRules.map((expandedRule) =>
    matchExpandedRule(expandedRule, {
      vmess: renderVmess,
      hy2: renderHy2,
    }),
  );
}

export function composeSingboxConfig(env: SingboxEnv, outbounds: SingboxOutbound[], secret?: string | null): string {
  if (!env.WARP_IPV6) {
    throw new EnvConfigError('WARP_IPV6 is not configured');
  }
  if (!env.WARP_PRIVATE_KEY) {
    throw new EnvConfigError('WARP_PRIVATE_KEY is not configured');
  }

  const tpl = structuredClone(sbTemplate) as MutableSingboxConfig;
  tpl.outbounds = tpl.outbounds || [];
  tpl.outbounds.push(...outbounds);

  const tags = outbounds.map((item) => item.tag).filter((tag) => tag !== '');

  tpl.outbounds.forEach((item) => {
    if (item.type === 'selector' || item.type === 'urltest') {
      const dynamicOutbounds = Array.isArray(item.outbounds) ? item.outbounds : [];
      dynamicOutbounds.push(...tags);
      item.outbounds = dynamicOutbounds;
    }
  });

  const endpoint = tpl.endpoints?.[0];
  if (!endpoint || !Array.isArray(endpoint.address)) {
    throw new EnvConfigError('sing-box template missing endpoints[0].address');
  }

  endpoint.address[1] = env.WARP_IPV6;
  endpoint.private_key = env.WARP_PRIVATE_KEY;

  if (secret && secret !== '') {
    tpl.experimental = tpl.experimental || {};
    tpl.experimental.clash_api = tpl.experimental.clash_api || {};
    tpl.experimental.clash_api.external_controller =
      tpl.experimental.clash_api.external_controller || '0.0.0.0:9090';
    tpl.experimental.clash_api.external_ui = env.DASHBOARD_PATH || 'dashboard';
    tpl.experimental.clash_api.secret = secret;
  }

  return JSON.stringify(tpl, null, 2);
}

function renderVmess(rule: VmessRule, { serverAddr, realHost, remark }: ExpandedRule): SingboxOutbound {
  return {
    tag: remark,
    type: 'vmess',
    server: serverAddr,
    server_port: Number.parseInt(rule.port, 10),
    uuid: rule.uuid,
    security: 'aes-128-gcm',
    alter_id: 0,
    tls: singboxTls(realHost),
    transport: {
      type: 'ws',
      headers: { Host: realHost },
      path: rule.path,
    },
    reuse_addr: true,
    udp_fragment: true,
    connect_timeout: '6s',
    tcp_fast_open: true,
  };
}

function renderHy2(rule: Hy2Rule, { serverAddr, realHost, remark }: ExpandedRule): SingboxOutbound {
  return {
    tag: remark,
    type: 'hysteria2',
    server: serverAddr,
    server_port: Number.parseInt(rule.port, 10),
    up_mbps: 100,
    down_mbps: 100,
    password: rule.password,
    tls: singboxTls(realHost),
  };
}

function singboxTls(serverName: string): Record<string, unknown> {
  return {
    enabled: true,
    insecure: false,
    min_version: '1.2',
    server_name: serverName,
    utls: { enabled: false, fingerprint: 'chrome' },
  };
}
