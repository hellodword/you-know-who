import fs from 'fs';
import { readJsoncFile } from './common.js';

const wranglerJsonTpl = readJsoncFile('wrangler.json.template');

const customJson = readJsoncFile('wrangler-custom.json');

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
