import { readWorkerConfigMap, runEntrypoint, runWrangler, topologicalSort, workerConfigArgs } from './common.ts';

async function deployAll(): Promise<number> {
  const customJson = readWorkerConfigMap();

  // Deploy providers first so service bindings resolve for downstream workers.
  const sortedNames = topologicalSort(customJson);

  for (const name of sortedNames) {
    console.log(`\nDeploying ${name} ...`);
    const exitCode = await runWrangler([...workerConfigArgs(name), 'deploy']);

    if (exitCode !== 0) {
      console.error(`Deployment failed for ${name}. Exiting with code ${exitCode}.`);
      return exitCode;
    }
  }

  return 0;
}

void runEntrypoint(deployAll);
