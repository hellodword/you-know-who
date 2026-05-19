# you-know-who

这是一个 `Cloudflare Worker` 项目，承担两项彼此独立的职责：

1. 为 `Shadowrocket`、`sing-box` 生成订阅内容。
2. 通过 Worker 的 `ASSETS` 绑定提供静态规则文件。

## 仓库结构

- `src/index.ts`：Worker 入口。根据请求分流到静态资源或订阅生成逻辑。
- `src/subscription/`：客户端识别、规则校验、订阅渲染与 `sing-box` 配置拼装逻辑。
- `src/sing-box-1.11.json`：`sing-box` 1.11 基础模板。iOS 版 `sing-box` 发布受阻并停留在 1.11，所以这里固定使用 1.11 模板；运行时会把生成出的节点追加进去。
- `assets/`：通过 `?assets=...` 暴露的静态规则文件。
- `wrangler.json.template`：提交到仓库的共享 Wrangler 默认配置。
- `wrangler-custom.json`：私有的、按环境区分的 Worker 定义，不提交。
- `scripts/`：生成实际 Wrangler 配置，以及执行单 Worker / 多 Worker 开发与部署的辅助脚本。

## 前置条件

- Node.js 版本需能运行当前安装的 `wrangler`。
- `wrangler` 已登录到目标 Cloudflare 账号。
- 本地已有从 `wrangler-custom.json.template` 派生出的 `wrangler-custom.json`。
- 本地已有 `.dev.vars`，并提供 `WARP_PRIVATE_KEY`，供 `sing-box` 输出在本地开发时使用。

## 初始化

```shell
npm ci

# minimal scopes
npx wrangler login --browser false --scopes account:read --scopes user:read --scopes workers_scripts:write --scopes workers_routes:write --scopes zone:read

npx wrangler whoami
```

从模板创建 `wrangler-custom.json`，再把占位值替换成真实的 Worker 名称、路由和运行时变量。

示例骨架：

```json
{
  "sub-generator": {
    "main": "src/index.ts",
    "routes": [
      {
        "pattern": "https://sub.example.com/worker-path*",
        "zone_name": "example.com"
      }
    ],
    "vars": {
      "REMOTE_SERVERS": {
        "203.0.113.10": "jp..example-1",
        "2001:db8::10": "jp..example-1-6"
      },
      "WARP_IPV6": "2001:db8::20/128",
      "DASHBOARD_PATH": "dashboard"
    }
  }
}
```

本地开发还需要：

```dotenv
WARP_PRIVATE_KEY=replace-me
```

生成出的 `*-wrangler.json` 以及 `wrangler-custom.json` 都被 Git 忽略，这是有意为之。

## 常用命令

- `npm run dev`：先生成配置，再交互选择要运行的 Worker，最后调用 `wrangler dev`。
- `npm run deploy`：先生成配置，再交互选择要部署的 Worker，最后调用 `wrangler deploy`。
- `npm run dev:all`：生成配置后，在同一个本地开发会话里启动所有已配置 Worker。
- `npm run deploy:all`：生成配置后，按依赖顺序依次部署所有 Worker。
- `npm run check`：执行 TypeScript 类型检查。
- `npm test`：运行 Vitest 测试。

## 配置与脚本维护

`wrangler.json.template` 是共享默认配置；`wrangler-custom.json` 是私有 overlay，被 Git 忽略。`scripts/generate.ts` 会把两者合并成每个 Worker 对应的 `*-wrangler.json`，并把 `wrangler-custom.json` 的顶层 key 写入最终配置的 `name` 字段。共享模板不得包含 `routes` 或 `vars`，这些字段必须来自私有 overlay。

`wrangler-custom.json` 可以通过 `services[].service` 声明同文件内另一个 Worker 的 service binding 依赖。脚本会校验缺失依赖和循环依赖：`deploy:all` 按依赖优先顺序部署，`dev:all` 在同一个本地开发会话里按反向顺序把所有 `--config` 传给 `wrangler dev`。

修改订阅规则、客户端识别或 `sing-box` 模板时，要同步更新 README 和测试。`sing-box` 输出会以 `src/sing-box-1.11.json` 为模板，追加生成出的 outbounds，并把它们的 tag 写入已有的 selector 与 urltest 分组。

## HTTP 行为

`src/index.ts` 暴露两种完全独立的请求模式。

### 1. 静态资源

当请求里带有 `assets` 时，Worker 会跳过订阅生成逻辑，直接把请求转发给 `env.ASSETS`。

示例：

```text
GET /worker-path?assets=shadowrocket.conf
```

查询参数会被规范化成类似 `/shadowrocket.conf` 这样的路径。

### 2. 订阅生成

当 `assets` 不存在时，Worker 期待查询参数里的 `rules` 是一个 JSON 编码后的数组。

支持的查询参数：

| 参数     | 必填 | 含义                                                                     |
| -------- | ---- | ------------------------------------------------------------------------ |
| `rules`  | 是   | 用来生成 outbound 的 JSON 编码规则数组。                                 |
| `client` | 否   | 覆盖客户端识别结果；未提供时会读取 `User-Agent`。                        |
| `secret` | 否   | 只在生成 `sing-box` 输出时使用，会写入 `experimental.clash_api.secret`。 |

每个规则对象必须包含 `tag`、`protocol`、`host`。`port` 可省略，默认是 `443`。

`vmess` 规则还必须包含 `uuid` 和 `path`：

```json
{
  "tag": "PROXY",
  "protocol": "vmess",
  "host": "edge.example.com",
  "port": "443",
  "path": "/ws",
  "uuid": "00000000-0000-0000-0000-000000000000"
}
```

对于 `hy2`，使用 `password`，而不是 `uuid` / `path`。不支持的客户端或规则会返回 `400`。

Shadowrocket 本地请求示例：

```shell
curl -G -H 'User-agent: shadowrocket/' 'http://localhost:8787/' --data-urlencode 'rules=[{"tag":"proxy","protocol":"hy2","host":"foo.com","password":"password"}]'
```

## 运行时变量

| 变量               | 使用位置               | 作用                                                                                      |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------------------- |
| `REMOTE_SERVERS`   | 订阅生成               | `serverAddr -> serverName` 的映射。每条规则都会对所有条目展开。                           |
| `WARP_IPV6`        | `sing-box` 输出        | 写入 `tpl.endpoints[0].address[1]`。                                                      |
| `WARP_PRIVATE_KEY` | `sing-box` 输出        | 写入 `tpl.endpoints[0].private_key`。本地开发时需要放在 `.dev.vars`。                     |
| `DASHBOARD_PATH`   | 可选的 `sing-box` 输出 | 当提供 `secret` 时，用于设置 `experimental.clash_api.external_ui`。默认值是 `dashboard`。 |

## 各客户端输出行为

- `Shadowrocket`：返回 base64 编码后的纯文本订阅，内容是生成出的 `vmess://` / `hysteria2://` 链接。
- `sing-box` Android / iOS：返回基于 `src/sing-box-1.11.json` 拼装出的 JSON 配置，并把生成节点追加到 selector 与 urltest 分组中。

客户端识别优先使用显式传入的 `client` 参数，否则读取请求头中的 `User-Agent`。当前内置识别标记如下：

- 显式 `client`：`shadowrocket`、`sing-box`、`singbox`、`sfa`、`sfi`
- `User-Agent`：`shadowrocket/`、`sfa/`、`sfi/`
