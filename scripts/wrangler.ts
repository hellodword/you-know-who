import {
  readWorkerConfigMap,
  resolveProvidedWorkerWranglerArgs,
  runEntrypoint,
  runWrangler,
  selectWorker,
  workerConfigArgs,
} from './common.ts';

async function wrapper(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Please provide a worker name and additional parameters!');
    return 1;
  }

  const customJson = readWorkerConfigMap();
  const providedArgs = resolveProvidedWorkerWranglerArgs(args, customJson);

  if (providedArgs) {
    return runWrangler(providedArgs);
  }

  const workerName = await selectWorker(customJson);
  return runWrangler([...workerConfigArgs(workerName), ...args]);
}

void runEntrypoint(wrapper);
