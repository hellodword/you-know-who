import {
  readWorkerConfigMap,
  runEntrypoint,
  runWrangler,
  topologicalSort,
  workerConfigArgsForNames,
} from './common.ts';

function devAll(): Promise<number> {
  const customJson = readWorkerConfigMap();

  // Reverse the dependency order so the top-level worker config is passed to wrangler first
  // in the shared local dev session.
  const sortedNames = topologicalSort(customJson).reverse();

  return runWrangler(['dev', ...workerConfigArgsForNames(sortedNames)]);
}

void runEntrypoint(devAll);
