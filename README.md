# you-know-who

这是一个 `Cloudflare Worker` 项目，承担两项彼此独立的职责：

1. 为 `Shadowrocket`、`sing-box`、`Karing`、`MikuBox` 和现代 `Mihomo` 系客户端生成订阅内容。
2. 通过 Worker 的 `ASSETS` 绑定提供静态规则文件。

## 仓库结构

- `src/index.ts`：Worker 入口。根据请求分流到静态资源或订阅生成逻辑。
- `src/subscription/`：客户端识别、规则校验、订阅渲染与 `sing-box` 配置拼装逻辑。
- `src/sing-box-1.11.json`：SFI 使用的 `sing-box` 1.11 基础模板。
- `src/sing-box-1.13.ts`：在共享分流方案上应用 1.13 DNS、路由与解析字段的 SFA/Karing 模板。
- `assets/`：通过直接路径或 `?assets=...` 暴露的静态规则文件。
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

修改订阅规则、客户端识别或 `sing-box` 模板时，要同步更新 README 和测试。两版 `sing-box` 输出共享分流主体，运行时会追加生成出的 outbounds，并把它们的 tag 写入已有的 selector 与 urltest 分组。

## HTTP 行为

`src/index.ts` 只接受 `GET`，其他方法会返回 `405`。除下文三个固定 Shadowrocket 配置文件名外，订阅生成不读取 pathname；只要请求命中 Worker route，`/worker-path`、`/anything/random` 这类路径都会按同一套逻辑处理。

Worker 暴露两种完全独立的请求模式。

### 1. 静态资源

当请求里带有 `assets` 时，Worker 会跳过订阅生成逻辑，直接把请求转发给 `env.ASSETS`。该通用入口继续适用于其他静态资源：

```text
GET /worker-path?assets=other-asset.txt
```

查询参数会被规范化成类似 `/other-asset.txt` 这样的路径。

所有成功的静态资源响应都会保留 ASSETS 返回的正文、状态和缓存头，并增加符合 RFC 6266 的下载文件名。文件名取规范化资源路径的最后一段，同时提供 ASCII fallback 和 UTF-8 编码：

```http
Content-Disposition: attachment; filename="other-asset.txt"; filename*=UTF-8''other-asset.txt
```

这样即使外部 Worker URL 使用 `?assets=...` 而没有以真实文件名结尾，Shadowrocket 也能按响应头识别文件名。资源不存在等非成功响应不会附加下载文件名。

Shadowrocket 配置使用三个显式文件名：

| 文件                            | 用途                                            |
| ------------------------------- | ----------------------------------------------- |
| `shadowrocket-common.conf`      | 共享的 General、Rule 和 Host，仅供 include 使用 |
| `shadowrocket-proxy.conf`       | `proxy:` 节点的普通自动选择配置                 |
| `shadowrocket-chain-proxy.conf` | `chain:` 节点的链式代理配置                     |

应把需要使用的 wrapper 作为 Worker 路径下的直接 URL 导入。例如 Worker route 是 `/worker-path*` 时：

```text
GET /worker-path/shadowrocket-proxy.conf
GET /worker-path/shadowrocket-chain-proxy.conf
```

两个 wrapper 都通过相对路径 `include=shadowrocket-common.conf` 引入共享配置。Worker 会识别任意 route 前缀末尾的这三个固定文件名并映射到 ASSETS，因此相对 include 仍在同一路径前缀下生效。旧的 `shadowrocket.conf` 已移除。

### 2. 订阅生成

当 `assets` 不存在时，Worker 期待查询参数里提供 `rules` 或重复的 `rule` 参数，二者不能混用。

支持的查询参数：

| 参数     | 必填   | 含义                                                                     |
| -------- | ------ | ------------------------------------------------------------------------ |
| `rules`  | 二选一 | 用来生成 outbound 的 JSON 编码规则数组。                                 |
| `rule`   | 二选一 | 单条 JSON 编码规则；可以重复传入多条。                                   |
| `client` | 否     | 覆盖客户端识别结果；未提供时会读取 `User-Agent`。                        |
| `format` | 否     | `client` 的别名；当 `client` 不存在时生效。                              |
| `secret` | 否     | 只在生成 `sing-box` 输出时使用，会写入 `experimental.clash_api.secret`。 |

每个规则对象必须包含 `tag`、`protocol`、`host`。`port` 可省略，默认是 `443`。

`vmess` 规则还必须包含 `uuid` 和 `path`：

```json
{
  "tag": "proxy:main",
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
curl -G -H 'User-agent: shadowrocket/' 'http://localhost:8787/' --data-urlencode 'rules=[{"tag":"proxy:main","protocol":"hy2","host":"foo.com","password":"password"}]'
```

等价的重复 `rule` 写法：

```shell
curl -G 'http://localhost:8787/anything/random' --data-urlencode 'format=sr' --data-urlencode 'rule={"tag":"proxy:main","protocol":"hy2","host":"foo.com","password":"password"}'
```

## 运行时变量

| 变量               | 使用位置               | 作用                                                                                      |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------------------- |
| `REMOTE_SERVERS`   | 订阅生成               | `serverAddr -> serverName` 的映射。每条规则都会对所有条目展开。                           |
| `WARP_IPV6`        | `sing-box` 输出        | 写入 `tpl.endpoints[0].address[1]`。                                                      |
| `WARP_PRIVATE_KEY` | `sing-box` 输出        | 写入 `tpl.endpoints[0].private_key`。本地开发时需要放在 `.dev.vars`。                     |
| `DASHBOARD_PATH`   | 可选的 `sing-box` 输出 | 当提供 `secret` 时，用于设置 `experimental.clash_api.external_ui`。默认值是 `dashboard`。 |

## 各客户端输出行为

客户端识别优先使用显式传入的 `client` 参数，其次使用 `format`，否则读取请求头中的 `User-Agent`。显式值存在但不受支持时返回 `400`，不会回退到 UA。

| 输出目标      | 显式 `client` / `format`                                                                       | User-Agent 标记                                   | 输出格式                                                  |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Shadowrocket  | `shadowrocket`、`sr`                                                                           | `Shadowrocket/`                                   | Base64 编码的 `vmess://` / `hysteria2://` URI 列表        |
| sing-box 1.11 | `sfi`                                                                                          | `SFI/`                                            | 完整 JSON                                                 |
| sing-box 1.13 | `sfa`、`sing-box`、`singbox`、`sb`、`karing`                                                   | `SFA/`、`Karing/`、`sing-box` / `singbox`         | 完整 JSON                                                 |
| Mihomo        | `mikubox`、`mihomo`、`clash-meta`、`clashmeta`、`meta`、`clash-verge`、`clashverge`、`flclash` | MikuBox、Mihomo、Clash.Meta、Clash Verge、FLClash | 包含 `proxies`、`PROXY` select 分组和 `MATCH` 规则的 YAML |

SFI 始终使用 1.11；SFA、Karing 和不带平台信息的通用 sing-box 别名使用 1.13。Android 客户端标记按 `SFA` 识别，不提供 `sfb` 别名。Karing 允许自定义订阅 UA；如果 UA 中没有 `Karing/`，应在订阅 URL 中显式加入 `client=karing`。

Shadowrocket 的 VMess 链接按规则 tag 大小写不敏感地区分：

- `chain:` 开头：输出 `chain=CHAIN`，不输出 `mux`。
- 其他 tag：保持 `mux=1`，不输出 `chain`。
- Hy2 不参与 chain/mux 分支，保持原有 URI。

两个 Shadowrocket wrapper 的 `PROXY` 都是 url-test，并使用 `http://www.gstatic.com/generate_204`；配置内保留注释说明 Shadowrocket 对 HTTPS 测试 URL 的兼容性 BUG。链式 wrapper 还提供匹配 `【` 的 `CHAIN` select 分组。

### 兼容性迁移

- 原先使用 `client=sing-box`、`client=singbox` 或 `client=sb` 获取 1.11 的 iOS 链接，改为 `client=sfi`。
- 原先导入 `shadowrocket.conf` 的客户端，按用途改为 `shadowrocket-proxy.conf` 或 `shadowrocket-chain-proxy.conf`。
- 原先使用 `chain-proxy:` tag 的 Shadowrocket VMess 规则改为 `chain:`；旧前缀不再触发链式代理。
- 现代 Mihomo 系支持 VMess 与 Hy2；本项目不把裸 `clash` 视为现代 Mihomo 别名。
