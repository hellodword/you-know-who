import { base64Encode } from './base64';
import { detectClient } from './client';
import { EnvConfigError, RuleParseError, RuleValidationError } from './errors';
import { renderMihomoConfig } from './mihomo';
import { expandRules, parseRulesSearchParams, type SubscriptionRule } from './rules';
import { renderShadowrocketOutbounds } from './shadowrocket';
import { composeSingboxConfig, renderSingboxOutbounds } from './sing-box';
import type { Env } from '../types';

const SHADOWROCKET_CONFIGS = new Set([
  'shadowrocket-common.conf',
  'shadowrocket-proxy.conf',
  'shadowrocket-chain-proxy.conf',
]);

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  const url = new URL(req.url);

  const assets = url.searchParams.get('assets');
  if (assets) {
    url.pathname = assets.replace(/^\/*/, '/');
    return fetchAsset(url, env);
  }

  const pathnameAsset = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  if (SHADOWROCKET_CONFIGS.has(pathnameAsset)) {
    url.pathname = `/${pathnameAsset}`;
    return fetchAsset(url, env);
  }

  const rulesResult = parseRules(url.searchParams);
  if (rulesResult instanceof Response) {
    return rulesResult;
  }

  const explicitClient = url.searchParams.get('client') || url.searchParams.get('format');
  const client = detectClient(explicitClient, req.headers.get('User-Agent'));
  if (!client) {
    return new Response('Unsupported client', { status: 400 });
  }

  try {
    const expandedRules = expandRules(env.REMOTE_SERVERS, rulesResult);

    if (client === 'shadowrocket') {
      const outbounds = renderShadowrocketOutbounds(expandedRules);
      return new Response(base64Encode(outbounds.join('\n')), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (client === 'mihomo') {
      return new Response(renderMihomoConfig(expandedRules), {
        headers: { 'content-type': 'text/yaml; charset=utf-8' },
      });
    }

    const outbounds = renderSingboxOutbounds(expandedRules);
    const target = client === 'sing-box-1.11' ? '1.11' : '1.13';
    return new Response(
      composeSingboxConfig(env, outbounds, target, url.searchParams.get('secret')),
      {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  } catch (error) {
    if (error instanceof EnvConfigError) {
      return new Response(error.message, { status: 500 });
    }

    throw error;
  }
}

async function fetchAsset(url: URL, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(url);
  if (!response.ok) {
    return response;
  }

  const filename = assetFilename(url.pathname);
  if (!filename) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('content-disposition', contentDisposition(filename));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function assetFilename(pathname: string): string | null {
  const pathSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (!pathSegment) {
    return null;
  }

  let decodedSegment: string;
  try {
    decodedSegment = decodeURIComponent(pathSegment);
  } catch {
    decodedSegment = pathSegment;
  }

  const filename = decodedSegment.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim();
  if (!filename || filename === '.' || filename === '..') {
    return null;
  }

  return filename;
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function parseRules(searchParams: URLSearchParams): SubscriptionRule[] | Response {
  try {
    return parseRulesSearchParams(searchParams);
  } catch (error) {
    if (error instanceof RuleParseError || error instanceof RuleValidationError) {
      return new Response(error.message, { status: 400 });
    }

    throw error;
  }
}
