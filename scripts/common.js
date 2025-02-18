import fs from 'fs';
import jsonc from 'jsonc-parser';
import { select, isCancel } from '@clack/prompts';

export function readJsoncFile(filePath) {
	const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
	return jsonc.parse(fileContent);
}

export function topologicalSort(data) {
	const keys = Object.keys(data);
	const dependencies = new Map();
	const visited = new Set();
	const sorted = [];

	for (const key of keys) {
		dependencies.set(
			key,
			(data[key].services || []).map((service) => service.service)
		);
	}

	console.log(dependencies);

	function visit(node) {
		if (visited.has(node)) {
			return;
		}
		visited.add(node);

		for (const dep of dependencies.get(node) || []) {
			if (!visited.has(dep)) {
				visit(dep);
			}
		}

		sorted.push(node);
	}

	for (const key of keys) {
		if (!visited.has(key)) {
			visit(key);
		}
	}

	return sorted;
}

export async function selectWorker(data) {
	const options = [];

	Object.entries(data).forEach(([name, customConfig]) => {
		const deps = (customConfig.services || []).map((service) => service.service);

		options.push({
			value: name,
			label: name,
			hint: deps.length === 0 ? null : deps.join(','),
		});
	});

	const projectType = await select({
		message: 'Pick a worker.',
		options,
	});

	if (isCancel(projectType)) {
		throw new Error('Operation cancelled');
	}

	return projectType;
}
