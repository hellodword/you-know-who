import { base64Encode } from './base64';
import { matchExpandedRule, type ExpandedRule, type Hy2Rule, type VmessRule } from './rules';

export function renderShadowrocketOutbounds(expandedRules: ExpandedRule[]): string[] {
  return expandedRules.map((expandedRule) =>
    matchExpandedRule(expandedRule, {
      vmess: renderVmess,
      hy2: renderHy2,
    }),
  );
}

function renderVmess(rule: VmessRule, { serverAddr, realHost, remark }: ExpandedRule): string {
  const params = new URLSearchParams({
    remarks: remark,
    obfsParam: JSON.stringify({ Host: realHost }),
    path: rule.path,
    obfs: 'websocket',
    tls: '1',
    mux: '1',
    alterId: '0',
    sni: realHost,
  });

  return `vmess://${base64Encode(`auto:${rule.uuid}@${serverAddr}:${rule.port}`)}?${params.toString()}`;
}

function renderHy2(rule: Hy2Rule, { serverAddr, realHost, remark }: ExpandedRule): string {
  return `hysteria2://${rule.password}@${serverAddr}:${rule.port}?peer=${realHost}&obfs=none#${remark}`;
}
