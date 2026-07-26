import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectClient } from '../src/subscription/client';
import { RuleParseError, RuleValidationError } from '../src/subscription/errors';
import { handleRequest } from '../src/subscription/handler';
import { renderMihomoConfig } from '../src/subscription/mihomo';
import { expandRules, parseRulesParam, parseRulesSearchParams, type SubscriptionRule } from '../src/subscription/rules';
import { renderShadowrocketOutbounds } from '../src/subscription/shadowrocket';
import { composeSingboxConfig, renderSingboxOutbounds } from '../src/subscription/sing-box';
import type { Env } from '../src/types';

const remoteServers = {
  '203.0.113.10': 'jp.example-1',
  '2001:db8::10': 'us.example-2',
};

const vmessRule = {
  tag: 'PROXY',
  protocol: 'vmess',
  host: 'edge.example.com',
  uuid: '00000000-0000-0000-0000-000000000000',
  path: '/ws',
} satisfies Record<string, unknown>;

const hy2Rule = {
  tag: 'FAST',
  protocol: 'hy2',
  host: 'hy.example.com',
  password: 'secret-password',
  port: 8443,
} satisfies Record<string, unknown>;

const env: Env = {
  ASSETS: {
    fetch: async (input) => {
      const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname === '/missing.conf') {
        return new Response('missing', {
          status: 404,
          headers: { 'x-asset-header': 'preserved' },
        });
      }

      return new Response(url.pathname, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          etag: '"asset-etag"',
        },
      });
    },
  },
  REMOTE_SERVERS: remoteServers,
  WARP_IPV6: '2001:db8::20/128',
  WARP_PRIVATE_KEY: 'test-private-key',
  DASHBOARD_PATH: 'dash',
};

describe('client detection', () => {
  it('supports explicit query aliases and supported user agents', () => {
    const explicitTargets = {
      shadowrocket: 'shadowrocket',
      sr: 'shadowrocket',
      sfi: 'sing-box-1.11',
      sfa: 'sing-box-1.13',
      'sing-box': 'sing-box-1.13',
      singbox: 'sing-box-1.13',
      sb: 'sing-box-1.13',
      karing: 'sing-box-1.13',
      mikubox: 'mihomo',
      mihomo: 'mihomo',
      'clash-meta': 'mihomo',
      clashmeta: 'mihomo',
      meta: 'mihomo',
      'clash-verge': 'mihomo',
      clashverge: 'mihomo',
      flclash: 'mihomo',
    } as const;

    for (const [alias, target] of Object.entries(explicitTargets)) {
      expect(detectClient(alias)).toBe(target);
    }

    expect(detectClient(null, 'Shadowrocket/1999')).toBe('shadowrocket');
    expect(detectClient(null, 'SFI/1.11.15')).toBe('sing-box-1.11');
    expect(detectClient(null, 'SFA/1.13.14')).toBe('sing-box-1.13');
    expect(detectClient(null, 'Karing/1.2.3 sing-box 1.13.14')).toBe('sing-box-1.13');
    expect(detectClient(null, 'sing-box 1.13.14')).toBe('sing-box-1.13');
    expect(detectClient(null, 'MikuBox/1.0 mihomo/1.19.28 android/16')).toBe('mihomo');
    expect(detectClient(null, 'mihomo.party/v2.0.0 (clash.meta)')).toBe('mihomo');
    expect(detectClient(null, 'Clash-Verge/2.4.0')).toBe('mihomo');
    expect(detectClient(null, 'FLClash/0.8.92')).toBe('mihomo');
  });

  it('lets an explicit client override the user agent', () => {
    expect(detectClient('sfi', 'SFA/1.13.14')).toBe('sing-box-1.11');
  });

  it('does not recognize unknown clients', () => {
    expect(detectClient('legacy-client')).toBeNull();
    expect(detectClient(null, 'LegacyClient/1.0')).toBeNull();
    expect(detectClient('unknown')).toBeNull();
    expect(detectClient('sfb')).toBeNull();
    expect(detectClient('clash')).toBeNull();
  });
});

describe('rule parsing and expansion', () => {
  it('validates vmess and hy2 rules and applies the default port', () => {
    const rules = parseRulesParam(JSON.stringify([vmessRule, hy2Rule]));

    expect(rules[0]).toMatchObject({ protocol: 'vmess', port: '443' });
    expect(rules[1]).toMatchObject({ protocol: 'hy2', port: '8443' });
  });

  it('rejects malformed rules', () => {
    expect(() => parseRulesParam('{')).toThrow(RuleParseError);
    expect(() => parseRulesParam('{}')).toThrow(RuleParseError);
    expect(() => parseRulesParam('[]')).toThrow(RuleValidationError);
    expect(() => parseRulesParam(JSON.stringify([{ ...vmessRule, uuid: '' }]))).toThrow(RuleValidationError);
    expect(() => parseRulesParam(JSON.stringify([{ ...vmessRule, protocol: 'trojan' }]))).toThrow(RuleValidationError);
  });

  it('supports repeated rule params and rejects mixed rule formats', () => {
    const repeated = new URLSearchParams();
    repeated.append('rule', JSON.stringify(vmessRule));
    repeated.append('rule', JSON.stringify(hy2Rule));

    expect(parseRulesSearchParams(repeated)).toEqual(parseRulesParam(JSON.stringify([vmessRule, hy2Rule])));

    const mixed = new URLSearchParams();
    mixed.set('rules', JSON.stringify([vmessRule]));
    mixed.append('rule', JSON.stringify(hy2Rule));

    expect(() => parseRulesSearchParams(mixed)).toThrow(RuleParseError);
  });

  it('expands every rule across every remote server', () => {
    const rules = parseRulesParam(JSON.stringify([vmessRule]));
    const expanded = expandRules(remoteServers, rules);

    expect(expanded).toHaveLength(2);
    expect(expanded[0]).toMatchObject({
      serverAddr: '203.0.113.10',
      serverName: 'jp.example-1',
      realHost: 'jp-example-1.edge.example.com',
      remark: 'PROXY:vmess:jp.example-1',
    });
  });
});

describe('renderers', () => {
  it('renders Shadowrocket vmess and hysteria2 links', () => {
    const expanded = expandRules({ '203.0.113.10': 'jp.example-1' }, parseRulesParam(JSON.stringify([vmessRule, hy2Rule])));
    const [vmess, hy2] = renderShadowrocketOutbounds(expanded);
    const vmessAuth = vmess.match(/^vmess:\/\/([^?]+)/)?.[1];

    expect(Buffer.from(vmessAuth || '', 'base64').toString('utf8')).toBe('auto:00000000-0000-0000-0000-000000000000@203.0.113.10:443');
    const vmessUrl = new URL(vmess);
    expect(vmessUrl.searchParams.get('remarks')).toBe('PROXY:vmess:jp.example-1');
    expect(vmessUrl.searchParams.get('obfsParam')).toBe('{"Host":"jp-example-1.edge.example.com"}');
    expect(vmessUrl.searchParams.get('path')).toBe('/ws');
    expect(vmessUrl.searchParams.get('sni')).toBe('jp-example-1.edge.example.com');
    expect(vmessUrl.searchParams.get('mux')).toBe('1');
    expect(vmessUrl.searchParams.has('chain')).toBe(false);
    expect(hy2).toBe('hysteria2://secret-password@203.0.113.10:8443?peer=jp-example-1.hy.example.com&obfs=none#FAST:hy2:jp.example-1');
  });

  it('makes Shadowrocket mux and chain mutually exclusive for vmess only', () => {
    const rules = parseRulesParam(
      JSON.stringify([
        { ...vmessRule, tag: 'ChAiN:landing' },
        { ...vmessRule, tag: 'chain-proxy:legacy' },
        { ...hy2Rule, tag: 'chain:unchanged' },
      ]),
    );
    const [chainVmess, legacyVmess, hy2] = renderShadowrocketOutbounds(
      expandRules({ '203.0.113.10': 'jp.example-1' }, rules),
    );
    const chainVmessUrl = new URL(chainVmess);
    const legacyVmessUrl = new URL(legacyVmess);
    const hy2Url = new URL(hy2);

    expect(chainVmessUrl.searchParams.get('chain')).toBe('CHAIN');
    expect(chainVmessUrl.searchParams.has('mux')).toBe(false);
    expect(legacyVmessUrl.searchParams.get('mux')).toBe('1');
    expect(legacyVmessUrl.searchParams.has('chain')).toBe(false);
    expect(hy2Url.searchParams.has('chain')).toBe(false);
    expect(hy2Url.searchParams.has('mux')).toBe(false);
  });

  it('renders a complete Mihomo configuration with vmess and hysteria2', () => {
    const rules = parseRulesParam(JSON.stringify([vmessRule, hy2Rule]));
    const config = renderMihomoConfig(expandRules({ '203.0.113.10': 'jp.example-1' }, rules));

    expect(config).toContain('mode: rule');
    expect(config).toContain('  - name: "PROXY:vmess:jp.example-1"');
    expect(config).toContain('    type: vmess');
    expect(config).toContain('    network: ws');
    expect(config).toContain('        Host: "jp-example-1.edge.example.com"');
    expect(config).toContain('  - name: "FAST:hy2:jp.example-1"');
    expect(config).toContain('    type: hysteria2');
    expect(config).toContain('proxy-groups:');
    expect(config).toContain('      - "PROXY:vmess:jp.example-1"');
    expect(config).toContain('      - "FAST:hy2:jp.example-1"');
    expect(config).toContain('  - MATCH,PROXY');
  });

  it('composes sing-box 1.13 JSON with generated nodes, WARP values, and clash secret', () => {
    const rules = parseRulesParam(JSON.stringify([vmessRule, hy2Rule]));
    const outbounds = renderSingboxOutbounds(expandRules({ '203.0.113.10': 'jp.example-1' }, rules));
    const config = JSON.parse(composeSingboxConfig(env, outbounds, '1.13', 'clash-secret')) as {
      $schema?: string;
      dns: {
        servers: Array<Record<string, unknown>>;
        rules: Array<Record<string, unknown>>;
        fakeip?: unknown;
      };
      inbounds: Array<Record<string, unknown>>;
      outbounds: Array<{ type: string; tag: string; outbounds?: string[] }>;
      endpoints: Array<{ address: string[]; private_key: string }>;
      route: {
        default_domain_resolver?: { server: string; strategy: string };
        rules: Array<{ rule_set?: string[]; outbound?: string }>;
      };
      experimental: { clash_api: { external_ui: string; secret: string } };
    };

    expect(config.$schema).toBeUndefined();
    expect(config.dns.servers[0]).toMatchObject({ type: 'tls', server: '8.8.8.8' });
    expect(config.dns.servers.some((server) => server.type === 'fakeip')).toBe(true);
    expect(config.dns.fakeip).toBeUndefined();
    expect(config.dns.rules.every((rule) => rule.action === 'route')).toBe(true);
    expect(config.dns.rules.at(-1)).toMatchObject({
      server: 'dns:proxy',
      client_subnet: '140.82.112.3',
    });
    expect(config.inbounds.find((inbound) => inbound.type === 'tun')).not.toHaveProperty('sniff');
    expect(config.outbounds.find((outbound) => outbound.type === 'direct')).not.toHaveProperty('domain_strategy');
    expect(config.route.default_domain_resolver).toEqual({
      server: 'dns:direct',
      strategy: 'prefer_ipv4',
    });
    expect(config.outbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: outbounds[0].tag })]));
    expect(config.outbounds.find((item) => item.type === 'selector')?.outbounds).toContain(outbounds[0].tag);
    expect(config.outbounds.find((item) => item.type === 'urltest')?.outbounds).toContain(outbounds[1].tag);
    expect(config.endpoints[0].address[1]).toBe('2001:db8::20/128');
    expect(config.endpoints[0].private_key).toBe('test-private-key');
    expect(config.experimental.clash_api).toMatchObject({ external_ui: 'dash', secret: 'clash-secret' });
    expect(config.route.rules.find((rule) => rule.rule_set?.includes('lyc8503:geosite:category:cryptocurrency'))?.outbound).toBe(
      '💲 加密货币',
    );
  });

  it('keeps the SFI template on sing-box 1.11 fields', () => {
    const outbounds = renderSingboxOutbounds(expandRules({ '203.0.113.10': 'jp.example-1' }, parseRulesParam(JSON.stringify([vmessRule]))));
    const config = JSON.parse(composeSingboxConfig(env, outbounds, '1.11')) as {
      $schema?: string;
      dns: { servers: Array<Record<string, unknown>>; fakeip?: unknown };
      inbounds: Array<Record<string, unknown>>;
      outbounds: Array<Record<string, unknown>>;
      route: { default_domain_resolver?: unknown };
    };

    expect(config.$schema).toContain('sing-box.schema.json');
    expect(config.dns.servers[0]).toMatchObject({ address: 'tls://8.8.8.8' });
    expect(config.dns.fakeip).toBeDefined();
    expect(config.inbounds.find((inbound) => inbound.type === 'tun')).toMatchObject({ sniff: true });
    expect(config.outbounds.find((outbound) => outbound.type === 'direct')).toMatchObject({
      domain_strategy: 'prefer_ipv4',
    });
    expect(config.route.default_domain_resolver).toBeUndefined();
  });
});

describe('Shadowrocket configuration assets', () => {
  it('provides exactly one common file and two group wrappers', async () => {
    const assetsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
    const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith('.conf')).sort();
    const common = await readFile(resolve(assetsDirectory, 'shadowrocket-common.conf'), 'utf8');
    const proxy = await readFile(resolve(assetsDirectory, 'shadowrocket-proxy.conf'), 'utf8');
    const chainProxy = await readFile(resolve(assetsDirectory, 'shadowrocket-chain-proxy.conf'), 'utf8');

    expect(files).toEqual(['shadowrocket-chain-proxy.conf', 'shadowrocket-common.conf', 'shadowrocket-proxy.conf']);
    expect(common).toContain('[General]');
    expect(common).toContain('[Rule]');
    expect(common).toContain('[Host]');
    expect(common).not.toContain('[Proxy Group]');
    expect(common).toContain('DNS 覆写');
    expect(common).toContain('规则自上而下匹配');
    expect(common).toContain('Hosts 可把域名固定到本地 IP');

    expect(proxy).toContain('include=shadowrocket-common.conf');
    expect(proxy).toContain('[Proxy Group]');
    expect(proxy).toContain('PROXY = url-test,url=http://www.gstatic.com/generate_204');
    expect(proxy).toContain('policy-regex-filter=^[pP][rR][oO][xX][yY]:');
    expect(proxy).toContain('interval=600 表示每 600 秒重测');
    expect(proxy).toContain('HTTPS');
    expect(proxy).toContain('BUG');
    expect(proxy).not.toContain('AUTO =');

    expect(chainProxy).toContain('include=shadowrocket-common.conf');
    expect(chainProxy).toContain('PROXY = url-test,url=http://www.gstatic.com/generate_204');
    expect(chainProxy).toContain('policy-regex-filter=^[cC][hH][aA][iI][nN]:');
    expect(chainProxy).not.toContain('^[cC][hH][aA][iI][nN]-[pP][rR][oO][xX][yY]:');
    expect(chainProxy).toContain('CHAIN = select,policy-regex-filter=【');
    expect(chainProxy).toContain('落地节点');
    expect(chainProxy).toContain('中转节点');
    expect(chainProxy).toContain('HTTPS');
    expect(chainProxy).toContain('BUG');

    const chainFilter = chainProxy.match(/^PROXY = .*policy-regex-filter=(.+)$/m)?.[1];
    expect(chainFilter).toBeDefined();
    expect(new RegExp(chainFilter || '').test('chain:vmess:landing')).toBe(true);
    expect(new RegExp(chainFilter || '').test('chain-proxy:vmess:legacy')).toBe(false);
  });
});

describe('request handler', () => {
  it('rejects non-GET requests', async () => {
    const response = await handleRequest(new Request('https://example.com/sub', { method: 'POST' }), env);

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
  });

  it('keeps static asset forwarding independent from subscription validation', async () => {
    const response = await handleRequest(new Request('https://example.com/sub?assets=/other-asset.txt&rules=bad'), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="other-asset.txt"; filename*=UTF-8''other-asset.txt`,
    );
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('etag')).toBe('"asset-etag"');
    expect(await response.text()).toBe('/other-asset.txt');
  });

  it('serves named Shadowrocket configs from paths with a worker prefix', async () => {
    const response = await handleRequest(new Request('https://example.com/worker-path/shadowrocket-proxy.conf?rules=bad'), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="shadowrocket-proxy.conf"; filename*=UTF-8''shadowrocket-proxy.conf`,
    );
    expect(await response.text()).toBe('/shadowrocket-proxy.conf');
  });

  it('encodes non-ASCII asset filenames using the requested path basename', async () => {
    const url = new URL('https://example.com/sub');
    url.searchParams.set('assets', '/nested/配置 file.conf');

    const response = await handleRequest(new Request(url), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="__ file.conf"; filename*=UTF-8''%E9%85%8D%E7%BD%AE%20file.conf`,
    );
  });

  it('preserves unsuccessful asset responses without a download filename', async () => {
    const response = await handleRequest(new Request('https://example.com/sub?assets=/missing.conf'), env);

    expect(response.status).toBe(404);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('x-asset-header')).toBe('preserved');
    expect(await response.text()).toBe('missing');
  });

  it('does not invent a download filename for an asset directory path', async () => {
    const response = await handleRequest(new Request('https://example.com/sub?assets=/'), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBeNull();
  });

  it('keeps subscription generation independent from the request pathname', async () => {
    const normalPath = await handleRequest(subscriptionRequest('shadowrocket', [vmessRule], '/sub'), env);
    const obscurePath = await handleRequest(subscriptionRequest('shadowrocket', [vmessRule], '/anything/random'), env);

    expect(obscurePath.status).toBe(200);
    expect(await obscurePath.text()).toBe(await normalPath.text());
  });

  it('returns Shadowrocket subscriptions as base64 text', async () => {
    const response = await handleRequest(subscriptionRequest('shadowrocket', [vmessRule]), env);
    const decoded = Buffer.from(await response.text(), 'base64').toString('utf8');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(decoded).toContain('vmess://');
  });

  it('returns generic sing-box subscriptions using the 1.13 template', async () => {
    const response = await handleRequest(subscriptionRequest('singbox', [vmessRule]), env);
    const config = (await response.json()) as { dns: { servers: Array<Record<string, unknown>> } };

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(config.dns.servers[0]).toMatchObject({ type: 'tls', server: '8.8.8.8' });
  });

  it('returns SFI subscriptions using the 1.11 template', async () => {
    const response = await handleRequest(subscriptionRequest('sfi', [vmessRule]), env);
    const config = (await response.json()) as { dns: { servers: Array<Record<string, unknown>> } };

    expect(response.status).toBe(200);
    expect(config.dns.servers[0]).toMatchObject({ address: 'tls://8.8.8.8' });
  });

  it('returns Karing subscriptions using sing-box 1.13', async () => {
    const response = await handleRequest(subscriptionRequest('karing', [vmessRule]), env);
    const config = (await response.json()) as { dns: { servers: Array<Record<string, unknown>> } };

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(config.dns.servers[0]).toMatchObject({ type: 'tls', server: '8.8.8.8' });
  });

  it('returns MikuBox subscriptions as a complete Mihomo YAML config', async () => {
    const response = await handleRequest(subscriptionRequest('mikubox', [vmessRule, hy2Rule]), env);
    const config = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/yaml; charset=utf-8');
    expect(config).toContain('proxy-groups:');
    expect(config).toContain('    type: hysteria2');
    expect(config).toContain('  - MATCH,PROXY');
  });

  it('supports format and repeated rule query params', async () => {
    const url = new URL('https://example.com/hidden-subscription');
    url.searchParams.set('format', 'sr');
    url.searchParams.append('rule', JSON.stringify(vmessRule));
    url.searchParams.append('rule', JSON.stringify(hy2Rule));

    const response = await handleRequest(new Request(url), env);
    const decoded = Buffer.from(await response.text(), 'base64').toString('utf8');

    expect(response.status).toBe(200);
    expect(decoded).toContain('vmess://');
    expect(decoded).toContain('hysteria2://');
  });

  it('supports the sing-box format alias', async () => {
    const url = new URL('https://example.com/arbitrary');
    url.searchParams.set('format', 'sb');
    url.searchParams.set('rules', JSON.stringify([vmessRule]));

    const response = await handleRequest(new Request(url), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('returns 400 for unsupported clients and rules', async () => {
    const unsupportedClient = await handleRequest(subscriptionRequest('legacy-client', [vmessRule]), env);
    const unsupportedRule = await handleRequest(subscriptionRequest('shadowrocket', [{ ...vmessRule, protocol: 'trojan' }]), env);

    expect(unsupportedClient.status).toBe(400);
    expect(await unsupportedClient.text()).toBe('Unsupported client');
    expect(unsupportedRule.status).toBe(400);
    expect(await unsupportedRule.text()).toContain('unsupported protocol');
  });

  it('returns 400 when rules and repeated rule params are mixed', async () => {
    const url = new URL('https://example.com/sub');
    url.searchParams.set('client', 'shadowrocket');
    url.searchParams.set('rules', JSON.stringify([vmessRule]));
    url.searchParams.append('rule', JSON.stringify(hy2Rule));

    const response = await handleRequest(new Request(url), env);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('either rules or rule');
  });
});

function subscriptionRequest(client: string, rules: Array<Record<string, unknown> | SubscriptionRule>, path = '/sub'): Request {
  const url = new URL(`https://example.com${path}`);
  url.searchParams.set('client', client);
  url.searchParams.set('rules', JSON.stringify(rules));

  return new Request(url);
}
