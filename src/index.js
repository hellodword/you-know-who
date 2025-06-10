import sb_1_11 from './sing-box-1.11.json';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams);

    const assets = params.assets;
    if (assets) {
      url.pathname = assets.replace(/^\/*/, '/');
      return env.ASSETS.fetch(url);
    }

    let rules = [];
    try {
      rules = JSON.parse(params.rules || '[]');
      if (!Array.isArray(rules)) throw new Error();
    } catch {
      return new Response('Invalid rules format', { status: 400 });
    }
    if (rules.length === 0) {
      return new Response('Empty rules', { status: 400 });
    }

    const clientType = detectClient(params.client || req.headers.get('User-Agent'));

    const outbounds = generateOutbounds(env.REMOTE_SERVERS, rules, clientType);
    if (outbounds.length === 0) {
      return new Response('Empty outbounds', { status: 500 });
    }

    const clientIsSingbox = ['SINGBOX_ANDROID', 'SINGBOX_IOS'].includes(clientType);
    const contentType = clientIsSingbox ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';

    const body = clientIsSingbox ? generateSingboxConfig(env, outbounds, params.secret) : base64Encode(outbounds.join('\n'));

    return new Response(body, { headers: { 'content-type': contentType } });
  },
};

const CLIENT_TYPES = {
  SHADOWROCKET: 'shadowrocket/',
  NEKOBOX: 'nekobox/',
  // https://github.com/SagerNet/sing-box-for-android/blob/3a2fc9c8802f0c40f0b1fd2d7acdcabb7aa0855f/app/src/main/java/io/nekohasekai/sfa/utils/HTTPClient.kt#L12-L23
  SINGBOX_ANDROID: 'sfa/',
  // https://github.com/SagerNet/sing-box-for-ios/blob/b17f2790cbc6a541a57b6cbc8859344cf9469653/SFI/Service/HTTPClient.swift#L5-L14
  SINGBOX_IOS: 'sfi/',
};

function detectClient(userAgent) {
  userAgent = userAgent.toLowerCase();
  return Object.keys(CLIENT_TYPES).find((type) => userAgent.includes(CLIENT_TYPES[type])) || 'UNKNOWN';
}

const base64Encode = (str) => Buffer.from(str).toString('base64');

function generateOutbounds(servers, rules, clientType) {
  const outbounds = [];

  rules.forEach((rule) => {
    const { tag, protocol, host, port = '443', path, uuid, password } = rule;

    Object.entries(servers).forEach(([serverAddr, serverName]) => {
      const realHost = `${serverName.replace(/\./g, '-')}.${host}`;
      const remark = `${tag}:${protocol}:${serverName}`;

      let outbound = '';
      if (protocol === 'vmess') {
        outbound = generateVmess(clientType, serverAddr, realHost, remark, uuid, port, path);
      } else if (protocol === 'hy2') {
        outbound = generateHy2(clientType, serverAddr, realHost, remark, password, port);
      }

      if (outbound) {
        outbounds.push(outbound);
      }
    });
  });

  return outbounds;
}

function generateVmess(clientType, serverAddr, realHost, remark, uuid, port, path) {
  const baseConfig = {
    serverAddr,
    realHost,
    remark,
    uuid,
    port,
    path,
  };

  const SINGBOX = () => ({
    tag: remark,
    type: 'vmess',
    server: serverAddr,
    server_port: parseInt(port),
    uuid,
    security: 'aes-128-gcm',
    alter_id: 0,
    tls: {
      enabled: true,
      insecure: false,
      min_version: '1.2',
      server_name: realHost,
      utls: { enabled: false, fingerprint: 'chrome' },
    },
    transport: {
      type: 'ws',
      headers: { Host: realHost },
      path,
    },
    reuse_addr: true,
    udp_fragment: true,
    connect_timeout: '6s',
    tcp_fast_open: true,
  });

  const vmessConfigs = {
    SHADOWROCKET: () =>
      `vmess://${base64Encode(
        `auto:${uuid}@${serverAddr}:${port}`,
      )}?remarks=${remark}&obfsParam=%7B%22Host%22:%22${realHost}%22%7D&path=${path}&obfs=websocket&tls=1&mux=1&alterId=0&sni=${realHost}`,

    NEKOBOX: () =>
      `vmess://${base64Encode(
        JSON.stringify({
          add: serverAddr,
          aid: '0',
          alpn: '',
          fp: '',
          host: realHost,
          id: uuid,
          net: 'ws',
          path,
          port,
          ps: remark,
          scy: 'aes-128-gcm',
          sni: realHost,
          tls: 'tls',
          type: '',
          v: '2',
        }),
      )}`,

    SINGBOX_ANDROID: SINGBOX,
    SINGBOX_IOS: SINGBOX,
  };

  return vmessConfigs[clientType]?.() || '';
}

function generateHy2(clientType, serverAddr, realHost, remark, password, port) {
  const baseConfig = {
    serverAddr,
    realHost,
    remark,
    password,
    port,
  };

  const SINGBOX = () => ({
    tag: remark,
    type: 'hysteria2',
    server: serverAddr,
    server_port: parseInt(port),
    up_mbps: 100,
    down_mbps: 100,
    password,
    tls: {
      enabled: true,
      insecure: false,
      min_version: '1.2',
      server_name: realHost,
      utls: { enabled: false, fingerprint: 'chrome' },
    },
  });

  const hy2Configs = {
    SHADOWROCKET: () => `hysteria2://${password}@${serverAddr}:${port}?peer=${realHost}&obfs=none#${remark}`,

    NEKOBOX: () => `hy2://${password}@${serverAddr}:${port}?sni=${realHost}#${remark}`,

    SINGBOX_ANDROID: SINGBOX,
    SINGBOX_IOS: SINGBOX,
  };

  return hy2Configs[clientType]?.() || '';
}

function generateSingboxConfig(env, outbounds, secret) {
  const tpl = structuredClone(sb_1_11);

  tpl.outbounds = tpl.outbounds || [];
  tpl.outbounds.push(...outbounds);

  const tags = outbounds.map((item) => item.tag).filter((tag) => !!tag);

  tpl.outbounds.forEach((item) => {
    if (item.type === 'selector' || item.type === 'urltest') {
      item.outbounds = item.outbounds || [];
      item.outbounds.push(...tags);
    }
  });

  tpl.endpoints[0].address[1] = env.WARP_IPV6;
  tpl.endpoints[0].private_key = env.WARP_PRIVATE_KEY;

  if (secret && secret !== '') {
    tpl.experimental = tpl.experimental || {};
    tpl.experimental.clash_api = tpl.experimental.clash_api || {};
    tpl.experimental.clash_api.external_controller = tpl.experimental.clash_api.external_controller || '0.0.0.0:9090';
    tpl.experimental.clash_api.external_ui = env.DASHBOARD_PATH || 'dashboard';
    tpl.experimental.clash_api.secret = secret;
  }

  return JSON.stringify(tpl, null, 2);
}
