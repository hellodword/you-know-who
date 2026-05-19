import { describe, expect, it } from 'vitest';
import {
  assertBaseTemplateHasNoPrivateFields,
  resolveProvidedWorkerWranglerArgs,
  topologicalSort,
  workerConfigArgs,
  workerConfigArgsForNames,
} from '../scripts/common';

describe('wrangler config helpers', () => {
  it('sorts service dependencies before dependents', () => {
    expect(
      topologicalSort({
        provider: {},
        consumer: {
          services: [{ binding: 'UPSTREAM', service: 'provider' }],
        },
      }),
    ).toEqual(['provider', 'consumer']);
  });

  it('rejects missing and circular service dependencies', () => {
    expect(() =>
      topologicalSort({
        consumer: {
          services: [{ binding: 'UPSTREAM', service: 'missing' }],
        },
      }),
    ).toThrow('missing worker "missing"');

    expect(() =>
      topologicalSort({
        a: { services: [{ binding: 'B', service: 'b' }] },
        b: { services: [{ binding: 'A', service: 'a' }] },
      }),
    ).toThrow('Circular service dependency: a -> b -> a');
  });

  it('keeps private overlay fields out of the base template', () => {
    expect(() => assertBaseTemplateHasNoPrivateFields({ main: 'src/index.ts' })).not.toThrow();
    expect(() => assertBaseTemplateHasNoPrivateFields({ routes: [] })).toThrow('routes');
    expect(() => assertBaseTemplateHasNoPrivateFields({ vars: {} })).toThrow('vars');
  });

  it('builds wrangler config arguments consistently', () => {
    expect(workerConfigArgs('sub-generator')).toEqual(['--config', 'sub-generator-wrangler.json']);
    expect(workerConfigArgsForNames(['outer', 'provider'])).toEqual([
      '--config',
      'outer-wrangler.json',
      '--config',
      'provider-wrangler.json',
    ]);
  });

  it('recognizes worker names before or after the wrangler command', () => {
    const workers = {
      provider: {},
      consumer: {
        services: [{ binding: 'UPSTREAM', service: 'provider' }],
      },
    };

    expect(resolveProvidedWorkerWranglerArgs(['consumer', 'dev', '--local'], workers)).toEqual([
      '--config',
      'consumer-wrangler.json',
      'dev',
      '--local',
    ]);
    expect(resolveProvidedWorkerWranglerArgs(['deploy', 'consumer', '--dry-run'], workers)).toEqual([
      '--config',
      'consumer-wrangler.json',
      'deploy',
      '--dry-run',
    ]);
    expect(resolveProvidedWorkerWranglerArgs(['deploy'], workers)).toBeNull();
  });
});
