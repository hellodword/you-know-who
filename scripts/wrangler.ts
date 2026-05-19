import { spawn } from 'node:child_process';
import { errorMessage, readJsoncFile, selectWorker, type WorkerConfigMap } from './common.ts';

async function wrapper(): Promise<void> {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      console.error('Please provide a worker name and additional parameters!');
      process.exit(1);
    }

    const customJson = readJsoncFile<WorkerConfigMap>('wrangler-custom.json');
    const wrangler = ['wrangler'];

    const firstArg = args[0];
    const secondArg = args[1];

    if (firstArg in customJson) {
      wrangler.push(...['--config', `${firstArg}-wrangler.json`], ...args.slice(1));
    } else if (secondArg && secondArg in customJson) {
      wrangler.push(...['--config', `${secondArg}-wrangler.json`], firstArg, ...args.slice(2));
    } else {
      const workerName = await selectWorker(customJson);
      wrangler.push(...['--config', `${workerName}-wrangler.json`], ...args);
    }

    const child = spawn('npx', wrangler, {
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

void wrapper();
