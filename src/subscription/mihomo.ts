import { matchExpandedRule, type ExpandedRule, type Hy2Rule, type VmessRule } from './rules';

export function renderMihomoConfig(expandedRules: ExpandedRule[]): string {
  const proxies = expandedRules.map((expandedRule) =>
    matchExpandedRule(expandedRule, {
      vmess: renderVmess,
      hy2: renderHy2,
    }),
  );

  return [
    'mode: rule',
    'log-level: info',
    'proxies:',
    ...proxies.flatMap((proxy) => proxy.lines),
    'proxy-groups:',
    '  - name: PROXY',
    '    type: select',
    '    proxies:',
    ...proxies.map((proxy) => `      - ${yamlString(proxy.name)}`),
    'rules:',
    '  - MATCH,PROXY',
    '',
  ].join('\n');
}

interface MihomoProxy {
  name: string;
  lines: string[];
}

function renderVmess(rule: VmessRule, { serverAddr, realHost, remark }: ExpandedRule): MihomoProxy {
  return {
    name: remark,
    lines: [
      `  - name: ${yamlString(remark)}`,
      '    type: vmess',
      `    server: ${yamlString(serverAddr)}`,
      `    port: ${Number.parseInt(rule.port, 10)}`,
      `    uuid: ${yamlString(rule.uuid)}`,
      '    alterId: 0',
      '    cipher: auto',
      '    udp: true',
      '    tls: true',
      `    servername: ${yamlString(realHost)}`,
      '    skip-cert-verify: false',
      '    network: ws',
      '    ws-opts:',
      `      path: ${yamlString(rule.path)}`,
      '      headers:',
      `        Host: ${yamlString(realHost)}`,
    ],
  };
}

function renderHy2(rule: Hy2Rule, { serverAddr, realHost, remark }: ExpandedRule): MihomoProxy {
  return {
    name: remark,
    lines: [
      `  - name: ${yamlString(remark)}`,
      '    type: hysteria2',
      `    server: ${yamlString(serverAddr)}`,
      `    port: ${Number.parseInt(rule.port, 10)}`,
      `    password: ${yamlString(rule.password)}`,
      `    sni: ${yamlString(realHost)}`,
      '    skip-cert-verify: false',
    ],
  };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
