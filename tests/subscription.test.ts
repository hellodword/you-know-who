import { describe, expect, it } from 'vitest';
import { detectClient } from '../src/subscription/client';
import { RuleParseError, RuleValidationError } from '../src/subscription/errors';
import { handleRequest } from '../src/subscription/handler';
import { expandRules, parseRulesParam, type SubscriptionRule } from '../src/subscription/rules';
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
      return new Response(url.pathname);
    },
  },
  REMOTE_SERVERS: remoteServers,
  WARP_IPV6: '2001:db8::20/128',
  WARP_PRIVATE_KEY: 'test-private-key',
  DASHBOARD_PATH: 'dash',
};

describe('client detection', () => {
  it('supports explicit query aliases and supported user agents', () => {
    expect(detectClient('shadowrocket')).toBe('shadowrocket');
    expect(detectClient('sing-box')).toBe('sing-box');
    expect(detectClient('singbox')).toBe('sing-box');
    expect(detectClient('sfa')).toBe('sing-box');
    expect(detectClient('sfi')).toBe('sing-box');
    expect(detectClient(null, 'Shadowrocket/1999')).toBe('shadowrocket');
    expect(detectClient(null, 'SFA/1.0')).toBe('sing-box');
    expect(detectClient(null, 'SFI/1.0')).toBe('sing-box');
  });

  it('does not recognize unknown clients', () => {
    expect(detectClient('legacy-client')).toBeNull();
    expect(detectClient(null, 'LegacyClient/1.0')).toBeNull();
    expect(detectClient('unknown')).toBeNull();
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
    expect(() => parseRulesParam(JSON.stringify([{ ...vmessRule, protocol: 'trojan' }]))).toThrow(
      RuleValidationError,
    );
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

    expect(Buffer.from(vmessAuth || '', 'base64').toString('utf8')).toBe(
      'auto:00000000-0000-0000-0000-000000000000@203.0.113.10:443',
    );
    expect(vmess).toContain('remarks=PROXY:vmess:jp.example-1');
    expect(vmess).toContain('sni=jp-example-1.edge.example.com');
    expect(hy2).toBe('hysteria2://secret-password@203.0.113.10:8443?peer=jp-example-1.hy.example.com&obfs=none#FAST:hy2:jp.example-1');
  });

  it('composes sing-box JSON with generated nodes, WARP values, and clash secret', () => {
    const rules = parseRulesParam(JSON.stringify([vmessRule, hy2Rule]));
    const outbounds = renderSingboxOutbounds(expandRules({ '203.0.113.10': 'jp.example-1' }, rules));
    const config = JSON.parse(composeSingboxConfig(env, outbounds, 'clash-secret')) as {
      outbounds: Array<{ type: string; tag: string; outbounds?: string[] }>;
      endpoints: Array<{ address: string[]; private_key: string }>;
      experimental: { clash_api: { external_ui: string; secret: string } };
    };

    expect(config.outbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: outbounds[0].tag })]));
    expect(config.outbounds.find((item) => item.type === 'selector')?.outbounds).toContain(outbounds[0].tag);
    expect(config.outbounds.find((item) => item.type === 'urltest')?.outbounds).toContain(outbounds[1].tag);
    expect(config.endpoints[0].address[1]).toBe('2001:db8::20/128');
    expect(config.endpoints[0].private_key).toBe('test-private-key');
    expect(config.experimental.clash_api).toMatchObject({ external_ui: 'dash', secret: 'clash-secret' });
  });
});

describe('request handler', () => {
  it('keeps static asset forwarding independent from subscription validation', async () => {
    const response = await handleRequest(new Request('https://example.com/sub?assets=/shadowrocket.conf&rules=bad'), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('/shadowrocket.conf');
  });

  it('returns Shadowrocket subscriptions as base64 text', async () => {
    const response = await handleRequest(subscriptionRequest('shadowrocket', [vmessRule]), env);
    const decoded = Buffer.from(await response.text(), 'base64').toString('utf8');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(decoded).toContain('vmess://');
  });

  it('returns sing-box subscriptions as JSON', async () => {
    const response = await handleRequest(subscriptionRequest('singbox', [vmessRule]), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toMatchObject({
      endpoints: [expect.objectContaining({ private_key: 'test-private-key' })],
    });
  });

  it('returns 400 for unsupported clients and rules', async () => {
    const unsupportedClient = await handleRequest(subscriptionRequest('legacy-client', [vmessRule]), env);
    const unsupportedRule = await handleRequest(subscriptionRequest('shadowrocket', [{ ...vmessRule, protocol: 'trojan' }]), env);

    expect(unsupportedClient.status).toBe(400);
    expect(await unsupportedClient.text()).toBe('Unsupported client');
    expect(unsupportedRule.status).toBe(400);
    expect(await unsupportedRule.text()).toContain('unsupported protocol');
  });
});

function subscriptionRequest(client: string, rules: Array<Record<string, unknown> | SubscriptionRule>): Request {
  const url = new URL('https://example.com/sub');
  url.searchParams.set('client', client);
  url.searchParams.set('rules', JSON.stringify(rules));

  return new Request(url);
}
