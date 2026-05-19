import { base64Encode } from './base64';
import { detectClient } from './client';
import { EnvConfigError, RuleParseError, RuleValidationError } from './errors';
import { expandRules, parseRulesSearchParams, type SubscriptionRule } from './rules';
import { renderShadowrocketOutbounds } from './shadowrocket';
import { composeSingboxConfig, renderSingboxOutbounds } from './sing-box';
import type { Env } from '../types';

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
    return env.ASSETS.fetch(url);
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

    const outbounds = renderSingboxOutbounds(expandedRules);
    return new Response(composeSingboxConfig(env, outbounds, url.searchParams.get('secret')), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    if (error instanceof EnvConfigError) {
      return new Response(error.message, { status: 500 });
    }

    throw error;
  }
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
