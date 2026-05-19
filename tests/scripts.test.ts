import { describe, expect, it } from 'vitest';
import { assertBaseTemplateHasNoPrivateFields, topologicalSort } from '../scripts/common';

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
});
