import { base64Encode } from './base64';
import type { ExpandedRule } from './rules';

export function renderShadowrocketOutbounds(expandedRules: ExpandedRule[]): string[] {
  return expandedRules.map((expandedRule) => {
    if (expandedRule.rule.protocol === 'vmess') {
      return renderVmess(expandedRule);
    }

    return renderHy2(expandedRule);
  });
}

function renderVmess({ rule, serverAddr, realHost, remark }: ExpandedRule): string {
  if (rule.protocol !== 'vmess') {
    throw new Error('Expected vmess rule');
  }

  return `vmess://${base64Encode(
    `auto:${rule.uuid}@${serverAddr}:${rule.port}`,
  )}?remarks=${remark}&obfsParam=%7B%22Host%22:%22${realHost}%22%7D&path=${rule.path}&obfs=websocket&tls=1&mux=1&alterId=0&sni=${realHost}`;
}

function renderHy2({ rule, serverAddr, realHost, remark }: ExpandedRule): string {
  if (rule.protocol !== 'hy2') {
    throw new Error('Expected hy2 rule');
  }

  return `hysteria2://${rule.password}@${serverAddr}:${rule.port}?peer=${realHost}&obfs=none#${remark}`;
}
