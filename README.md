# Mocker · 本地 Mock Server

一个带可视化控制台的本地 Mock 服务：用 Web UI 管理接口规则，支持多 HTTP 方法、响应延迟、四种响应类型（JSON / HTML / File / JavaScript 动态生成），以及一个「JSON 结构化」模式——通过字段树选择数据类型、填写正则，由服务实时生成随机数据。

## 快速开始

```bash
npm install

# 开发模式：后端 3001 + 前端 5173（已配置代理）
npm run dev
# 打开 http://localhost:5173

# 生产模式：单端口运行（前端构建产物由 Express 托管）
npm run build && npm start
# 打开 http://localhost:3001
```

首次启动会在 `data/` 下创建 SQLite 数据库，并自动写入 3 条示例规则（静态 JSON + 延迟、JavaScript 动态响应、JSON 结构化生成）。

环境变量：

| 变量          | 默认值      | 说明                                                      |
| ------------- | ----------- | --------------------------------------------------------- |
| `PORT`        | `3001`      | HTTP 端口                                                 |
| `HOST`        | `127.0.0.1` | 监听地址，默认**仅本机**；设为 `0.0.0.0` 才会暴露到局域网 |
| `MOCK_PREFIX` | `/mock`     | Mock 入口前缀，置空则 mock 直接从根路径提供               |
| `DATA_DIR`    | `./data`    | 数据库与上传文件目录                                      |
| `LOG_LEVEL`   | `info`      | 日志级别：`info` / `warn` / `error` / `silent`            |

> 安全提示：管理 API 可以写入并执行任意 JavaScript，因此默认只监听 `127.0.0.1`。
> 需要团队共享时请显式设置 `HOST=0.0.0.0`，并确保只在可信网络中使用（启动时会打印警告）。

## 功能

### 1. 接口规则管理

左侧列表支持搜索、按 HTTP 方法筛选、启用/停用开关、复制与删除；中间为编辑区，右侧为实时响应预览。规则字段包括名称、备注、方法、路径（支持 `:id` 形式的路径参数）、状态码、自定义响应头、Content-Type、启用状态。同一路径不同方法可以各自配置，互不干扰。

### 2. HTTP 方法

支持 `GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS`。Mock 路由按「方法 + 路径」精确匹配，未命中返回 404 JSON 提示；`OPTIONS` 预检请求在无对应规则时自动返回 204（已开启 CORS）。没有单独配置 `HEAD` 规则时，会自动回退到同路径的 `GET` 规则（与 Express 行为一致）。

多条规则命中同一「方法 + 路径」时：

- **带条件的规则优先于无条件规则**（与创建顺序无关），方便用条件规则做特例、无条件规则做兜底
- 同类规则之间以「最新创建的」为准，控制台会在列表与编辑区标注「重复」冲突

### 3. 延迟设置

每条规则可设置「固定延迟 (ms)」与「随机抖动 (ms)」，实际延迟 = 固定值 + `0 ~ 抖动值` 的随机数，便于模拟弱网与超时场景。单条规则延迟上限 60000 ms；控制台预览时跳过延迟。

### 4. 响应预览（可设置请求参数）

右侧「响应预览」顶部的**请求参数**面板可以模拟真实请求，改完 250ms 自动重新生成：

- **Path params**：自动解析规则路径中的 `:id` 等占位符并逐个填值（默认 `1`）
- **Query**：键值对形式，实时拼到预览 URL 上
- **Headers**：键值对形式，键名会像 Express 一样统一转成小写
- **Body**：非 GET/HEAD 方法显示，JSON 会自动解析为对象；解析失败则原样传字符串

面板底部会显示最终的请求行（`GET /api/users/42?page=3`）。预览与真实请求共用同一条响应管道，仅跳过延迟。

### 5. 高级能力（条件匹配 / 响应序列 / 连接行为 / 代理透传）

在编辑区底部的「高级」面板中：

**条件匹配** —— 让同一路径按请求内容返回不同响应，所有条件需同时满足（AND）：

| 来源     | 说明                       | 示例                    |
| -------- | -------------------------- | ----------------------- |
| `query`  | 查询参数                   | `type` `=` `vip`        |
| `header` | 请求头（键名不区分大小写） | `x-env` `=` `staging`   |
| `cookie` | Cookie                     | `token` `存在`          |
| `body`   | 请求体，支持 `a.b` 点路径  | `user.type` `≠` `guest` |
| `path`   | 路径参数                   | `id` `正则` `^9\d+$`    |

支持 `= / ≠ / 包含 / 正则 / > / < / 存在`。带条件的规则优先于无条件规则，因此可以「一条条件规则做特例 + 一条无条件规则做兜底」。

**响应序列** —— 按顺序循环返回不同结果，用于模拟「首次成功、再次失败」等场景：

```
第 1 次 → 200 {"try":1}
第 2 次 → 500 {"try":2}
第 3 次 → 200 {"try":1}   （循环）
```

每档可覆盖状态码、延迟与响应体，留空的字段沿用规则本身；计数器在内存中，可点「重置计数」归零，也可调用 `POST /__api/variants/reset`。预览面板顶部可切换预览某一档。

**连接行为**（基础配置） —— 模拟网络异常：

| 选项       | 行为                                      |
| ---------- | ----------------------------------------- |
| 正常响应   | 按规则返回内容                            |
| 断开连接   | 延迟后直接 reset 连接（客户端报网络错误） |
| 挂起不响应 | 永不返回，用于验证客户端超时逻辑          |

**代理透传** —— 在「设置」页填写目标地址（如 `https://api.example.com`）后，未命中任何规则的请求会被原样转发（保留 method / 路径 / query / header / body），便于只 mock 部分接口、其余走真实后端；目标不可达时返回 502。

### 6. 响应类型

| 类型       | 说明                                                                |
| ---------- | ------------------------------------------------------------------- |
| JSON       | 在编辑器内直接编写，带合法性校验与一键格式化                        |
| HTML       | 原样返回 HTML 文本，`Content-Type: text/html`                       |
| File       | 返回文件库中已上传的文件，按扩展名自动推断 Content-Type，支持二进制 |
| JavaScript | 每段请求执行一次脚本，`return` 的结果即响应体                       |
| JSON 结构  | 可视化字段树 + 数据类型 + 正则，每次请求随机生成                    |

#### JavaScript 动态响应

编辑器内书写脚本，可用变量：

```js
// req: { method, path, params, query, headers, cookies, body }
// console, faker, RandExp, uuid(), require(...)
const id = req.params.id ?? '1';

return {
  code: 0,
  data: {
    id: Number(id),
    name: faker.person.fullName(),
    phone: new RandExp(/^1[3-9]\d{9}$/).gen(),
    requestId: uuid(),
  },
};
```

- 返回字符串 → 原样作为响应体；返回对象 → 序列化为 JSON
- `require()` 白名单：`faker`、`@faker-js/faker`、`randexp`、`uuid`、`path`、`url`、`util`、`crypto`、`querystring`
- 脚本超时 2000 ms
- 沙箱内**没有** `setInterval` / `clearInterval`；`setTimeout` 注册的定时器会在脚本返回后统一清理，避免脚本把工作排到响应之后
- **安全提示**：脚本通过 Node `vm` 在独立上下文中执行，用于隔离拼写错误与死循环，**不是安全沙箱**。Mocker 定位为本地开发工具，请只运行自己信任的脚本，不要将其暴露在公网。

### 7. JSON 结构化模式

用字段树描述响应结构，支持嵌套 `object` 与 `array`（可设元素数量范围）。字段类型：

- `string`：生成方式可选 **Regex**（填正则，如 `^1[3-9]\d{9}$` 手机号、`^NO\d{12}$` 订单号）、**Faker**（如 `person.fullName`）、**Enum**、**Fixed**
- `int` / `number`：最小值 / 最大值 / 小数位
- `boolean`：true 概率
- `uuid`、`date`（ISO / 时间戳 / 自定义格式）、`enum`（逗号分隔可选值）
- `object`：任意层级的子字段
- `array`：元素类型（可为对象/嵌套数组）+ 数量范围

点击「生成样例」可立即预览随机结果；重复上限做了保护，异常正则会降级为普通随机串并在预览中提示。

根节点可切换为**对象**或**数组**（数组可设置元素数量范围），因此既能返回 `{...}` 也能返回 `[{...}, ...]`。

#### 从 JSON 示例导入

点击「导入 JSON 示例」，粘贴一段真实响应即可自动生成字段树（支持对象数组，取第一个元素作为模板）：

| 示例值                     | 推断结果                                   |
| -------------------------- | ------------------------------------------ |
| `13800138000`              | string / Regex `^1[3-9]\d{9}$`             |
| `NO202601010001`           | string / Regex `^[A-Z]{2}\d{12}$`          |
| `SKU-ABC-123456`           | string / Regex `^[A-Z]{3}-[A-Z]{3}-\d{6}$` |
| `ada@example.com`          | string / Faker `internet.email`            |
| `https://…`                | string / Faker `internet.url`              |
| `Ada Lovelace`             | string / Faker `person.fullName`           |
| `3f2504e0-…-3301`          | uuid                                       |
| `2026-01-01T08:00:00.000Z` | date / ISO                                 |
| `1001` / `9.5`             | int 0~~2002 / number 0~~19（小数位 1）     |
| `true`                     | boolean（true 概率 0.9）                   |
| `["admin","beta"]`         | array（数量 2，元素按首个值推断）          |
| `{...}`                    | object（递归展开子字段）                   |

导入时可选择字符串处理策略：**智能**（上表规则，未识别的字符串保留原值）、**Faker**（统一随机）、**原值**（统一固定值）；并选择「追加到末尾」或「替换现有字段」。

## 管理 API

所有管理接口位于 `/__api` 前缀下：

```
GET    /__api/info                 服务信息（端口、前缀、数据库路径、驱动等）
GET    /__api/rules                规则列表 + 重复路径冲突（{ rules, conflicts }）
GET    /__api/settings             运行设置（proxyTarget）
PUT    /__api/settings             更新运行设置
POST   /__api/variants/reset       重置响应序列计数（body: { ruleId? }）
POST   /__api/rules                新建规则
GET    /__api/rules/:id            单条规则
PUT    /__api/rules/:id            更新规则
DELETE /__api/rules/:id            删除规则
POST   /__api/rules/:id/duplicate  复制规则
POST   /__api/preview              预览响应
                                   body: { rule, request: { params, query, rawQuery, headers, body } }
GET    /__api/export               导出全部配置（?files=0 只导出规则与设置，不含文件 base64）
POST   /__api/import               导入配置（body: { rules, mode: 'merge' | 'replace' }）
                                   返回 { imported, updated, filesRestored, total }
GET    /__api/files                文件列表
POST   /__api/files/upload         上传文件（multipart，字段名 file）
GET    /__api/files/:id/download   下载文件
DELETE /__api/files/:id            删除文件（被规则引用时返回 409，加 ?force=1 强制删除）
GET    /__api/logs                 最近 200 条请求日志
DELETE /__api/logs                 清空日志
```

调用示例（[HTTPie](https://httpie.io/)，安装：`brew install httpie` 或 `pip install httpie`）：

```bash
http POST http://localhost:3001/__api/rules \
  'content-type: application/json' \
  --raw '{"name":"ping","method":"GET","path":"/ping","responseType":"json","body":"{\"pong\":true}","delayMs":500}'

http GET http://localhost:3001/mock/ping
```

> 省略方法时 HTTPie 会根据有无请求体推断（非交互 shell 下容易误判为 POST），所以这里显式写 `GET`。

控制台里的「HTTPie」按钮会按当前规则生成同样可直接粘贴的命令。

## 目录结构

```
server/src
├── index.ts              进程入口
├── app.ts                Express 组装（/mock、/__api、静态托管）
├── config.ts             环境变量与路径
├── db/                   SQLite 适配器、建表、规则/文件仓储
├── routes/               mock 入口、管理 API、文件 API
└── services/             规则匹配、响应管道、vm 脚本、结构化生成、日志
web/src
├── components/           规则列表、编辑器、字段树、预览、UI 原语
├── pages/                规则管理 / 文件库 / 设置
└── lib/                  API 客户端、常量、工具函数
```

## 开发脚本与质量保障

```bash
npm run dev           # 并行启动后端（3001）与前端（5173）
npm test              # 单元测试 + 集成测试（Vitest）
npm run test:watch    # 监听模式
npm run test:coverage # 生成覆盖率报告（终端 + coverage/lcov.info）
npm run typecheck     # 服务端与前端分别做 tsc --noEmit
npm run lint          # ESLint（--max-warnings 0，警告也会失败）
npm run lint:fix      # 自动修复可修复的 ESLint 问题
npm run format        # Prettier 统一格式
npm run format:check  # CI 用的格式校验
npm run build         # 构建前端到 dist/web
npm run verify        # 以上质量门的组合：typecheck → lint → format → 覆盖率测试 → build
```

测试要点：

- `tests/` 下按模块组织，覆盖规则匹配、响应管道（五种响应类型 + 响应封装）、vm 脚本沙箱、结构化生成、条件匹配、响应序列、规则仓储与请求日志。
- `tests/api.test.ts` 会真正启动 Express 实例（随机端口）验证管理 API、文件库与 Mock 路由，包括条件优先级、变体轮转、连接中断、代理透传与 404 兜底。
- 每个测试文件通过 `tests/setup.ts` 拿到独立的临时 `DATA_DIR`，并行运行也不会污染 `data/`。
- 覆盖率以 `server/src` 为口径并设置阈值（低于阈值 CI 直接失败）。

GitHub Actions（`.github/workflows/ci.yml`）在 push / PR 时依次执行：类型检查 + ESLint + Prettier、Node 24/26 上的测试与覆盖率、前端构建与生产模式冒烟（启动服务并请求 `/__api/info` 与示例 mock 接口）。

## 技术说明

- **持久化**：优先使用 Node 内置 `node:sqlite`（Node ≥ 22.5，零原生依赖），不可用时回退到 `better-sqlite3`。数据落在 `data/mocker.db`，上传文件在 `data/uploads/`，运行设置存在 `settings` 表；新增列通过启动时的 `ALTER TABLE` 自动补齐，老库可直接升级。
- **导入导出**：导出为 `version: 2` 的 JSON，包含规则完整配置、**上传文件的 base64 内容**与运行设置，换机器导入即可完整还原（含 File 类型响应）。
- **匹配策略**：不动态注册路由，而是维护带版本号的规则表缓存，`path-to-regexp` 预编译后按「方法 + 路径」匹配，写操作自动失效缓存。
- **预览一致性**：控制台预览与真实请求共用同一条响应管道，仅跳过延迟，保证「所见即所得」。
