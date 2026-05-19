import { handleRequest } from './subscription/handler';
import type { Env } from './types';

export default {
  fetch(req, env) {
    return handleRequest(req, env);
  },
} satisfies ExportedHandler<Env>;
