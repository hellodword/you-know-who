import { spawn } from 'node:child_process';
import { errorMessage, readJsoncFile, topologicalSort, type WorkerConfigMap } from './common.ts';

function devAll(): void {
  try {
    const customJson = readJsoncFile<WorkerConfigMap>('wrangler-custom.json');
    const configs: string[] = [];

    // Reverse the dependency order so the top-level worker config is passed to wrangler first
    // in the shared local dev session.
    const sortedNames = topologicalSort(customJson).reverse();

    for (const name of sortedNames) {
      configs.push('--config');
      configs.push(`${name}-wrangler.json`);
    }

    const child = spawn('npx', ['wrangler', 'dev'].concat(configs), {
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    child.on('close', (code) => {
      process.exit(code ?? 1);
    });
  } catch (error) {
    console.error(`An unexpected error occurred: ${errorMessage(error)}`);
    process.exit(1);
  }
}

devAll();
