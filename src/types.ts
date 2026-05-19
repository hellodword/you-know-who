export interface Env {
  ASSETS: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
  REMOTE_SERVERS: Record<string, string>;
  WARP_IPV6?: string;
  WARP_PRIVATE_KEY?: string;
  DASHBOARD_PATH?: string;
}
