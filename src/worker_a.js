import { WorkerEntrypoint } from 'cloudflare:workers';

export default class extends WorkerEntrypoint {
	async fetch(req, env, ctx) {
		return new Response('hello world!');
	}

	add(a, b) {
		return a + b;
	}
}
