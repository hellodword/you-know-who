import { EnvConfigError, RuleParseError, RuleValidationError } from './errors';

export type Protocol = 'vmess' | 'hy2';

export interface BaseRule {
  tag: string;
  protocol: Protocol;
  host: string;
  port: string;
}

export interface VmessRule extends BaseRule {
  protocol: 'vmess';
  path: string;
  uuid: string;
}

export interface Hy2Rule extends BaseRule {
  protocol: 'hy2';
  password: string;
}

export type SubscriptionRule = VmessRule | Hy2Rule;

export interface ExpandedRule {
  rule: SubscriptionRule;
  serverAddr: string;
  serverName: string;
  realHost: string;
  remark: string;
}

type RuleRecord = Record<string, unknown>;
type ProtocolMatcher<T> = {
  vmess: (rule: VmessRule, expandedRule: ExpandedRule) => T;
  hy2: (rule: Hy2Rule, expandedRule: ExpandedRule) => T;
};

export function parseRulesSearchParams(searchParams: URLSearchParams): SubscriptionRule[] {
  const rulesParam = searchParams.get('rules');
  const ruleParams = searchParams.getAll('rule');

  if (rulesParam !== null && ruleParams.length > 0) {
    throw new RuleParseError('Use either rules or rule parameters, not both');
  }

  if (ruleParams.length > 0) {
    return ruleParams.map(parseRuleParam);
  }

  return parseRulesParam(rulesParam);
}

export function parseRulesParam(value?: string | null): SubscriptionRule[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value || '[]');
  } catch {
    throw new RuleParseError('Invalid rules format');
  }

  if (!Array.isArray(parsed)) {
    throw new RuleParseError('Invalid rules format');
  }
  if (parsed.length === 0) {
    throw new RuleValidationError('Empty rules');
  }

  return parsed.map(validateRule);
}

export function matchExpandedRule<T>(expandedRule: ExpandedRule, matcher: ProtocolMatcher<T>): T {
  if (expandedRule.rule.protocol === 'vmess') {
    return matcher.vmess(expandedRule.rule, expandedRule);
  }

  return matcher.hy2(expandedRule.rule, expandedRule);
}

export function expandRules(servers: unknown, rules: SubscriptionRule[]): ExpandedRule[] {
  const normalizedServers = validateRemoteServers(servers);

  return rules.flatMap((rule) =>
    Object.entries(normalizedServers).map(([serverAddr, serverName]) => ({
      rule,
      serverAddr,
      serverName,
      realHost: `${serverName.replace(/\./g, '-')}.${rule.host}`,
      remark: `${rule.tag}:${rule.protocol}:${serverName}`,
    })),
  );
}

function parseRuleParam(value: string, index: number): SubscriptionRule {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RuleParseError(`Invalid rule ${index} format`);
  }

  return validateRule(parsed, index);
}

function validateRule(raw: unknown, index: number): SubscriptionRule {
  if (!isRecord(raw)) {
    throw new RuleValidationError(`Rule ${index} must be an object`);
  }

  const protocol = raw.protocol;
  if (protocol !== 'vmess' && protocol !== 'hy2') {
    throw new RuleValidationError(`Rule ${index} has unsupported protocol`);
  }

  const base = {
    tag: requiredString(raw, 'tag', index),
    protocol,
    host: requiredString(raw, 'host', index),
    port: optionalPort(raw, index),
  };

  if (protocol === 'vmess') {
    return {
      ...base,
      protocol,
      uuid: requiredString(raw, 'uuid', index),
      path: requiredString(raw, 'path', index),
    };
  }

  return {
    ...base,
    protocol,
    password: requiredString(raw, 'password', index),
  };
}

function validateRemoteServers(servers: unknown): Record<string, string> {
  if (!isRecord(servers) || Array.isArray(servers)) {
    throw new EnvConfigError('REMOTE_SERVERS must be an object');
  }

  const entries = Object.entries(servers);
  if (entries.length === 0) {
    throw new EnvConfigError('REMOTE_SERVERS must not be empty');
  }

  for (const [serverAddr, serverName] of entries) {
    if (serverAddr.trim() === '' || typeof serverName !== 'string' || serverName.trim() === '') {
      throw new EnvConfigError('REMOTE_SERVERS must map non-empty server addresses to names');
    }
  }

  return servers as Record<string, string>;
}

function requiredString(rule: RuleRecord, field: string, index: number): string {
  const value = rule[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuleValidationError(`Rule ${index} missing required ${field}`);
  }
  return value;
}

function optionalPort(rule: RuleRecord, index: number): string {
  const value = rule.port ?? '443';
  const port = typeof value === 'number' ? String(value) : value;

  if (typeof port !== 'string' || !/^\d+$/.test(port)) {
    throw new RuleValidationError(`Rule ${index} has invalid port`);
  }

  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new RuleValidationError(`Rule ${index} has invalid port`);
  }

  return port;
}

function isRecord(value: unknown): value is RuleRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
