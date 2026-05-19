import { base64Encode } from './base64';
import { detectClient } from './client';
import { EnvConfigError, RuleParseError, RuleValidationError } from './errors';
import { expandRules, parseRulesParam } from './rules';
import { renderShadowrocketOutbounds } from './shadowrocket';
import { composeSingboxConfig, renderSingboxOutbounds } from './sing-box';
import type { Env } from '../types';

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  const assets = url.searchParams.get('assets');
  if (assets) {
    url.pathname = assets.replace(/^\/*/, '/');
    return env.ASSETS.fetch(url);
  }

  const rulesResult = parseRules(url.searchParams.get('rules'));
  if (rulesResult instanceof Response) {
    return rulesResult;
  }

  const client = detectClient(url.searchParams.get('client'), req.headers.get('User-Agent'));
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

function parseRules(rulesParam: string | null): SubscriptionRule[] | Response {
  try {
    return parseRulesParam(rulesParam);
  } catch (error) {
    if (error instanceof RuleParseError || error instanceof RuleValidationError) {
      return new Response(error.message, { status: 400 });
    }

    throw error;
  }
}

type SubscriptionRule = ReturnType<typeof parseRulesParam>[number];
