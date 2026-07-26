import legacyTemplate from './sing-box-1.11.json';

type ConfigRecord = Record<string, unknown>;

interface MutableTemplate extends ConfigRecord {
  $schema?: string;
  dns?: ConfigRecord;
  inbounds?: ConfigRecord[];
  outbounds?: ConfigRecord[];
  route?: ConfigRecord;
}

const template = structuredClone(legacyTemplate) as MutableTemplate;

delete template.$schema;

template.dns = {
  servers: [
    {
      type: 'tls',
      tag: 'dns:proxy',
      server: '8.8.8.8',
      detour: '🚀 节点选择',
    },
    {
      type: 'tls',
      tag: 'dns:direct',
      server: '1.12.12.12',
    },
    {
      type: 'local',
      tag: 'dns:local',
    },
    {
      type: 'fakeip',
      tag: 'dns:fakeip',
      inet4_range: '198.18.0.0/15',
      inet6_range: 'fc00::/18',
    },
  ],
  rules: [
    {
      rule_set: ['lyc8503:geosite:private'],
      action: 'route',
      server: 'dns:local',
    },
    {
      clash_mode: 'direct',
      action: 'route',
      server: 'dns:direct',
    },
    {
      clash_mode: 'global',
      action: 'route',
      server: 'dns:proxy',
      client_subnet: '140.82.112.3',
    },
    {
      rule_set: [
        'lyc8503:geosite:geolocation@!cn',
        'lyc8503:geosite:alibaba@!cn',
        'lyc8503:geosite:alibabacloud@!cn',
        'lyc8503:geosite:aliyun@!cn',
        'lyc8503:geosite:bilibili@!cn',
        'lyc8503:geosite:bytedance@!cn',
        'lyc8503:geosite:huawei@!cn',
        'lyc8503:geosite:huaweicloud@!cn',
        'lyc8503:geosite:jd@!cn',
        'lyc8503:geosite:qcloud@!cn',
        'lyc8503:geosite:tencent-games@!cn',
        'lyc8503:geosite:tencent@!cn',
        'lyc8503:geosite:tiktok@!cn',
        'lyc8503:geosite:xiaomi@!cn',
      ],
      query_type: ['A', 'AAAA'],
      action: 'route',
      server: 'dns:fakeip',
      rewrite_ttl: 1,
    },
    {
      rule_set: ['lyc8503:geosite:cn', 'lyc8503:geosite:geolocation@cn'],
      action: 'route',
      server: 'dns:direct',
    },
    {
      query_type: ['A', 'AAAA'],
      action: 'route',
      server: 'dns:fakeip',
      rewrite_ttl: 1,
    },
    {
      action: 'route',
      server: 'dns:proxy',
      client_subnet: '140.82.112.3',
    },
  ],
  final: 'dns:proxy',
  strategy: 'prefer_ipv4',
  independent_cache: true,
};

const tunInbound = template.inbounds?.find((inbound) => inbound.type === 'tun');
if (!tunInbound) {
  throw new Error('sing-box 1.11 template missing TUN inbound');
}
delete tunInbound.sniff;

const directOutbound = template.outbounds?.find((outbound) => outbound.type === 'direct');
if (!directOutbound) {
  throw new Error('sing-box 1.11 template missing direct outbound');
}
delete directOutbound.domain_strategy;

if (!template.route) {
  throw new Error('sing-box 1.11 template missing route');
}
template.route.default_domain_resolver = {
  server: 'dns:direct',
  strategy: 'prefer_ipv4',
};

export default template;
