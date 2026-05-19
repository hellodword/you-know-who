import fs from 'node:fs';
import { isCancel, select } from '@clack/prompts';
import { parse, type ParseError } from 'jsonc-parser';

export interface ServiceBindingConfig {
  service?: unknown;
}

export interface WorkerConfig {
  services?: unknown;
  [key: string]: unknown;
}

export type WorkerConfigMap = Record<string, WorkerConfig>;

// Local wrangler config files use JSONC so operators can keep comments in templates.
export function readJsoncFile<T = unknown>(filePath: string): T {
  const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
  const errors: ParseError[] = [];
  const parsed = parse(fileContent, errors);

  if (errors.length > 0) {
    throw new Error(`${filePath} contains invalid JSONC`);
  }

  return parsed as T;
}

export function assertBaseTemplateHasNoPrivateFields(config: unknown, filePath = 'wrangler.json.template'): void {
  if (!isRecord(config)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }

  const forbiddenFields = ['routes', 'vars'].filter((field) => Object.prototype.hasOwnProperty.call(config, field));
  if (forbiddenFields.length > 0) {
    throw new Error(`${filePath} must not define private overlay fields: ${forbiddenFields.join(', ')}`);
  }
}

// `services[].service` points to another top-level worker name in wrangler-custom.json.
// The returned order always places dependencies before dependents for deployment.
export function topologicalSort(data: WorkerConfigMap): string[] {
  validateWorkerConfigMap(data);

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: string[] = [];
  const stack: string[] = [];

  function visit(node: string): void {
    if (visited.has(node)) {
      return;
    }

    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      const cycle = [...stack.slice(cycleStart), node].join(' -> ');
      throw new Error(`Circular service dependency: ${cycle}`);
    }

    visiting.add(node);
    stack.push(node);

    for (const dep of serviceDependencies(node, data[node], data)) {
      visit(dep);
    }

    stack.pop();
    visiting.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  for (const key of Object.keys(data)) {
    visit(key);
  }

  return sorted;
}

// Single-worker commands fall back to an interactive picker when no worker name is supplied.
export async function selectWorker(data: WorkerConfigMap): Promise<string> {
  const options = Object.entries(data).map(([name, customConfig]) => {
    const deps = serviceDependencies(name, customConfig, data);

    return {
      value: name,
      label: name,
      hint: deps.length === 0 ? undefined : deps.join(','),
    };
  });

  const projectType = await select({
    message: 'Pick a worker.',
    options,
  });

  if (isCancel(projectType)) {
    throw new Error('Operation cancelled');
  }

  return projectType;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateWorkerConfigMap(data: WorkerConfigMap): void {
  if (!isRecord(data) || Array.isArray(data)) {
    throw new Error('wrangler-custom.json must contain a JSON object');
  }

  for (const [name, config] of Object.entries(data)) {
    if (!isRecord(config) || Array.isArray(config)) {
      throw new Error(`${name} config must be an object`);
    }
    serviceDependencies(name, config, data);
  }
}

function serviceDependencies(name: string, config: WorkerConfig, data: WorkerConfigMap): string[] {
  const services = config.services ?? [];
  if (!Array.isArray(services)) {
    throw new Error(`${name}.services must be an array`);
  }

  return services.map((service, index) => {
    if (!isRecord(service) || typeof service.service !== 'string' || service.service.trim() === '') {
      throw new Error(`${name}.services[${index}].service must reference another worker`);
    }

    if (!(service.service in data)) {
      throw new Error(`${name}.services[${index}].service references missing worker "${service.service}"`);
    }

    return service.service;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
