import { spawn } from 'node:child_process';
import { errorMessage, readJsoncFile, topologicalSort, type WorkerConfigMap } from './common.ts';

function runSpawn(name: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', '--config', `${name}-wrangler.json`, 'deploy'], {
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    child.on('close', (code) => {
      resolve(code);
    });
  });
}

async function deployAll(): Promise<void> {
  try {
    const customJson = readJsoncFile<WorkerConfigMap>('wrangler-custom.json');

    // Deploy providers first so service bindings resolve for downstream workers.
    const sortedNames = topologicalSort(customJson);

    for (const name of sortedNames) {
      console.log(`\nDeploying ${name} ...`);
      const exitCode = await runSpawn(name);

      if (exitCode !== 0) {
        console.error(`Deployment failed for ${name}. Exiting with code ${exitCode}.`);
        process.exit(exitCode ?? 1);
      }
    }
  } catch (error) {
    console.error(`An unexpected error occurred: ${errorMessage(error)}`);
    process.exit(1);
  }
}

void deployAll();
