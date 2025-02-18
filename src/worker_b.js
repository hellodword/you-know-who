export default {
	async fetch(req, env, ctx) {
		const result = await env.WORKER_A.add(1, 2);
		return new Response(result);
	},
};
