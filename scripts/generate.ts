import fs from 'node:fs';
import {
  assertBaseTemplateHasNoPrivateFields,
  readJsoncFile,
  readWorkerConfigMap,
  topologicalSort,
} from './common.ts';

const wranglerJsonTpl = readJsoncFile<Record<string, unknown>>('wrangler.json.template');
assertBaseTemplateHasNoPrivateFields(wranglerJsonTpl);

const customJson = readWorkerConfigMap();
topologicalSort(customJson);

// Merge shared defaults with each private worker override into generated wrangler configs.
Object.entries(customJson).forEach(([name, customConfig]) => {
  console.log(`Generating ${name} ...`);

  const mergedJson = {
    ...wranglerJsonTpl,
    ...customConfig,
    name,
  };

  const outputFilePath = `${name}-wrangler.json`;
  fs.writeFileSync(outputFilePath, JSON.stringify(mergedJson, null, 2), { encoding: 'utf-8' });

  console.log(`File written to ${outputFilePath}`);
});
