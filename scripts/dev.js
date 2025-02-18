import { spawn } from 'child_process';
import { readJsoncFile, topologicalSort } from './common.js';

function devAll() {
  try {
    const customJson = readJsoncFile('wrangler-custom.json');

    const configs = [];

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
      process.exit(code);
    });
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    process.exit(1);
  }
}

devAll();
