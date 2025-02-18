import { spawn } from 'child_process';
import { readJsoncFile, selectWorker } from './common.js';

async function wrapper() {
	try {
		const args = process.argv.slice(2);

		if (args.length === 0) {
			console.error('Please provide a worker name and additional parameters!');
			process.exit(1);
		}

		const customJson = readJsoncFile('wrangler-custom.json');

		const wrangler = ['wrangler'];

		let workerName = args[0];
		if (workerName in customJson) {
			wrangler.push(...['--config', `${workerName}-wrangler.json`]);
			wrangler.push(...args.slice(1));
		} else {
			workerName = await selectWorker(customJson);
			wrangler.push(...['--config', `${workerName}-wrangler.json`]);
			wrangler.push(...args);
		}

		const child = spawn('npx', wrangler, {
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

wrapper();
