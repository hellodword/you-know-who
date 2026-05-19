# 维护说明

## 项目意图

这个仓库本质上是一个部署在 Worker 侧的订阅生成器，加上一个小型静态资源出口。

- 资源模式：`?assets=...` 从 `ASSETS` 绑定里提供规则文件。
- 订阅模式：`?rules=...` 把逻辑规则展开到所有已配置远端服务器，并输出客户端对应格式的结果。

这两种模式互相独立。除非请求分流契约变化，否则改动资源文件不应影响订阅生成逻辑。

## 请求流

### 订阅生成

`src/index.ts` 接收一个 JSON 编码后的 `rules` 数组，识别客户端类型，然后为每个 `rule x REMOTE_SERVERS` 组合生成具体 outbound。具体逻辑拆在 `src/subscription/` 下。

关键转换点：

- `REMOTE_SERVERS` 是一个 `serverAddr -> serverName` 的映射。
- `realHost` 通过 `${serverName.replace(/\./g, '-')}.${host}` 计算得到。
- `remark` 通过 `${tag}:${protocol}:${serverName}` 计算得到。
- `vmess` 和 `hy2` 会根据不同客户端渲染成 `Shadowrocket` 链接或 `sing-box` outbound。
- `sing-box` 输出以 `src/sing-box-1.11.json` 为模板，追加生成出的 outbounds，并把它们的 tag 写入已有的 `selector` / `urltest` 分组。
- `secret` 只影响 `tpl.experimental.clash_api.secret`。

### 资源输出

当请求里存在 `assets` 时，Worker 会重写 `url.pathname` 并调用 `env.ASSETS.fetch(url)`。这一分支不会执行任何订阅参数校验。

## 配置模型

### 共享配置与私有配置

- `wrangler.json.template`：提交到仓库的共享默认配置。
- `wrangler-custom.json`：私有 Worker 定义，被 Git 忽略。
- `*-wrangler.json`：生成后的合并结果，也被 Git 忽略。

`scripts/generate.ts` 会把共享模板和 `wrangler-custom.json` 顶层每个条目合并，并把顶层 key 写入最终配置的 `name` 字段。共享模板不得包含 `routes` 或 `vars`，这些字段必须来自私有 overlay。

### Worker 依赖关系

`wrangler-custom.json` 可以声明这样的 service binding：

```json
{
  "consumer-worker": {
    "services": [
      {
        "binding": "UPSTREAM",
        "service": "provider-worker"
      }
    ]
  }
}
```

其中 `service` 必须引用同一个文件中的另一个顶层 Worker 名称。

`scripts/common.ts` 会从这些 `services[].service` 值构建依赖图，并做拓扑排序。缺失的 service 依赖和循环依赖会直接报错。

## 脚本链路

- `npm run dev` / `npm run deploy`
  - 先运行 `scripts/generate.ts`。
  - 再调用 `scripts/wrangler.ts`。
  - 如果第一个 CLI 参数命中某个 Worker 名称，就直接使用对应配置。
  - 否则先交互选择 Worker，再把剩余参数传给 `wrangler`。
- `npm run dev:all`
  - 先运行 `scripts/generate.ts`。
  - 读取 `wrangler-custom.json` 中的全部 Worker。
  - 把拓扑排序结果反转后，再把 `--config` 依次传给同一个 `wrangler dev` 进程。
  - 实际效果是：本地多 Worker 开发时，最下游 / 最外层的 Worker 会先传给 `wrangler`。
- `npm run deploy:all`
  - 先运行 `scripts/generate.ts`。
  - 按拓扑顺序串行部署，确保 service provider 先于 dependent 存在。

## 运行时约束

- `src/subscription/sing-box.ts` 会把 `src/sing-box-1.11.json` 作为 Worker bundle 的一部分导入。
- 这个导入路径之所以能正常工作，是因为实际运行时由 Wrangler 完成打包。
- 运行时验证应以 Wrangler 驱动方式为准；本地单元测试通过 Vitest 覆盖订阅拼装逻辑。
- 当前本地开发默认通过 `.dev.vars` 提供 `WARP_PRIVATE_KEY`。

## 变更检查清单

- 如果新增客户端类型，要同时更新 `src/subscription/client.ts` 中的识别标记和对应渲染分支。
- 如果修改规则结构，要同步更新运行时注释和 README 里的参数文档。
- 如果改动 `services` 关系，要同时验证 `dev:all` 和 `deploy:all` 的顺序。
- 如果修改 `sing-box` 模板，要确认生成节点的 tag 仍然会流入预期的 selector 和 urltest 分组。
