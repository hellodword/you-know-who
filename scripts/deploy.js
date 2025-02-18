import { spawn } from 'child_process';
import { readJsoncFile, topologicalSort } from './common.js';

function runSpawn(name) {
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

async function deployAll() {
	try {
		const customJson = readJsoncFile('wrangler-custom.json');

		const sortedNames = topologicalSort(customJson);

		for (const name of sortedNames) {
			console.log(`\nDeploying ${name} ...`);
			const exitCode = await runSpawn(name);

			if (exitCode !== 0) {
				console.error(`Deployment failed for ${name}. Exiting with code ${exitCode}.`);
				process.exit(exitCode);
			}
		}
	} catch (error) {
		console.error(`An unexpected error occurred: ${error.message}`);
		process.exit(1);
	}
}

deployAll();
