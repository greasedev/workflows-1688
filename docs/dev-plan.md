# 商品价格与库存监控开发计划

## 1. 当前代码状态

当前仓库已经具备基础工程结构，但业务能力尚未实现：

- `docs/prd.md` 已定义商品价格与库存监控需求。
- `src/models/types.ts` 目前只有基础 `Source` 和 `Product` 字段。
- `src/libs/db.ts` 已定义 Dexie 数据库和 `source`、`product` 两张表，但缺少 PRD 中要求的时间、错误信息等字段索引设计。
- `src/pages/index.html`、`src/pages/index.ts`、`src/pages/index.css` 当前为空。
- `src/workflows/default_workflow.ts` 当前是脚手架，只创建了 `Agent` 和 API client，尚未读取 URL 或更新商品。
- `src/api.ts` 已生成 `get_sku_list_from_url(product_url)` API client，只允许复用，绝对不能修改。

## 2. 实施顺序

### 2.1 数据模型与数据库

目标：先统一页面和工作流共享的数据结构，避免后续实现重复判断。

开发任务：

- 更新 `src/models/types.ts`：
  - `Source` 增加 `createdAt`、`updatedAt`、`lastCheckedAt`、`lastError`。
  - `Product` 增加 `updatedAt`。
  - 如需要，增加工作流结果摘要类型，例如成功 URL 数、失败 URL 数、更新商品数和错误摘要。
- 更新 `src/libs/db.ts`：
  - 保留 `source` 表唯一 URL 约束。
  - 保留 `product` 表 `[name+url]` 唯一约束。
  - 为 `product.url`、`product.name` 保留索引，支持 URL 查询和商品名称查询。
  - 如 schema 版本需要变更，使用 Dexie `version(2)` 迁移，避免破坏已有数据。

验收点：

- 页面和工作流可以引用同一套类型。
- `source.url` 唯一。
- `product` 能按 `url` 和 `name` 查询。

### 2.2 Excel 导入能力

目标：实现用户通过 Excel 导入 URL 列表，固定读取 `URL` 表头并合并去重。

开发任务：

- 新增依赖 `xlsx`，用于浏览器端解析 Excel。
- 在 `src/pages/index.ts` 中实现文件读取：
  - 读取第一个工作表。
  - 使用固定表头 `URL`。
  - 缺少 `URL` 表头时显示错误。
  - 对每个 URL 做 `trim`。
  - 过滤空值和明显非法 URL。
- 实现合并去重写入：
  - 已存在 URL 不重复插入。
  - 新 URL 写入 `source`，带上 `createdAt` 和 `updatedAt`。
  - 导入完成后展示新增 URL 数、重复 URL 数、无效或空 URL 数。

验收点：

- 上传包含 `URL` 表头的 Excel 后，URL 被写入 `source`。
- 重复 URL 不重复插入。
- 缺少 `URL` 表头时有明确错误提示。

### 2.3 Pages 页面 UI

目标：实现完整的 URL 监控列表和商品查询界面。

开发任务：

- 在 `src/pages/index.html` 中搭建页面结构：
  - Excel 上传区域。
  - 导入结果提示区域。
  - URL 监控列表区域。
  - 商品查询区域。
- 在 `src/pages/index.css` 中实现基础布局：
  - 使用清晰的管理台布局。
  - URL 和商品数需要是两个不同的可点击目标。
  - 商品表格在窄屏下保持可读。
- 在 `src/pages/index.ts` 中实现页面数据加载：
  - 初始化 `Agent` 和 DB。
  - 加载 URL 列表。
  - 按 URL 聚合商品数。
  - 加载商品查询结果。

URL 监控列表交互：

- 每行展示 URL 和该 URL 已提取商品数。
- 点击 URL：打开新页面展示该 URL 的原始页面内容。
- 点击商品数：跳转或切换到商品查询区域，并按该 URL 筛选商品。

商品查询交互：

- 支持商品名称模糊查询。
- 支持 URL 查询。
- 商品名称和 URL 同时存在时，结果必须同时满足两个条件。
- 查询结果展示商品名称、价格、库存、来源 URL、更新时间。
- 没有匹配结果时展示空状态。

验收点：

- URL 列表能显示 URL 和商品数。
- 点击 URL 会打开原始页面。
- 点击商品数会筛选商品查询结果。
- 商品查询支持名称、URL 以及二者组合过滤。

### 2.4 Workflow 批量更新

目标：实现遍历所有待监控 URL，调用提取 API，并更新商品价格和库存。

开发任务：

- 更新 `src/workflows/default_workflow.ts` frontmatter：
  - 描述该工作流用于更新商品价格和库存。
  - 输出说明包含成功数、失败数、更新商品数和错误摘要。
- 实现工作流主逻辑：
  - 初始化 DB。
  - 读取 `source` 表中的所有 URL。
  - 逐个 URL 调用 `apis.get_sku_list_from_url(url)`。
  - 单个 URL 失败时记录错误并继续下一个 URL。
- 实现 API 结果解析：
  - 优先读取 `task.extract_data`。
  - 支持解析 JSON 字符串。
  - 优先从数组本身或 `products`、`skus`、`data` 字段中识别商品数组。
  - 跳过商品名称为空的记录。
  - 将价格和库存转换为数字。
- 实现商品写入：
  - 同一 URL 下按 `[name+url]` upsert。
  - 更新 `price`、`stock`、`updatedAt`。
  - 记录本次 URL 返回的商品名称集合。
- 实现缺失商品库存置零：
  - 查询该 URL 下所有历史商品。
  - 历史商品如果本次未出现，将 `stock` 更新为 `0`，并更新 `updatedAt`。
- 更新 URL 检查状态：
  - 成功时更新 `lastCheckedAt`，清空 `lastError`。
  - 失败时更新 `lastCheckedAt` 和 `lastError`。
- 返回工作流摘要：
  - 总 URL 数。
  - 成功 URL 数。
  - 失败 URL 数。
  - 更新商品数。
  - 库存置零商品数。
  - 错误摘要。

验收点：

- 工作流能遍历所有 `source` URL。
- API 返回多个商品时能分别写入或更新。
- 某个 URL 失败不阻断后续 URL。
- 本次未返回的历史商品库存变为 `0`。
- 工作流返回清晰摘要。

### 2.5 构建与验证

目标：确保页面和工作流均可构建，并覆盖核心业务场景。

开发任务：

- 运行页面构建：`pnpm run build:pages`。
- 运行工作流构建：`pnpm run build`。
- 如页面需要本地人工验证，运行：`pnpm run dev:pages`。

手工验证场景：

- 上传包含 `URL` 表头的 Excel，确认新增 URL 和重复 URL 统计正确。
- 上传缺少 `URL` 表头的 Excel，确认错误提示正确。
- URL 列表展示每条 URL 和商品数。
- 点击 URL 打开原始 URL 页面。
- 点击商品数进入商品查询并筛选该 URL 商品。
- 输入商品名称关键字进行模糊查询。
- 输入 URL 查询对应商品。
- 同时输入商品名称和 URL，确认使用组合过滤。
- 工作流处理多个 URL，其中一个失败时整体继续执行。
- 工作流重新抓取后，缺失商品库存更新为 `0`。

## 3. 文件级改动清单

预计修改或新增文件：

- `package.json`、`pnpm-lock.yaml`：新增 `xlsx` 依赖。
- `src/models/types.ts`：扩展 `Source`、`Product` 类型。
- `src/libs/db.ts`：更新 Dexie schema 和索引。
- `src/pages/index.html`：新增页面结构。
- `src/pages/index.ts`：实现 Excel 导入、URL 列表、商品查询和交互逻辑。
- `src/pages/index.css`：实现页面样式。
- `src/workflows/default_workflow.ts`：实现批量 URL 处理和商品更新工作流。

禁止修改文件：

- `src/api.ts`：该文件是自动生成的 API client，开发中只能通过现有 `createWorkflowApis(agent).get_sku_list_from_url(product_url)` 调用，不能编辑、重生成或格式化该文件。

## 4. 风险与处理策略

- API 返回结构不稳定：实现解析函数，兼容数组、`products`、`skus`、`data` 等常见结构；无法识别时记录 URL 错误并继续。
- Excel 内容不规范：固定要求 `URL` 表头；空 URL 和非法 URL 不导入，并在导入结果中统计。
- IndexedDB schema 升级：如果已有用户数据，使用 Dexie 新版本迁移，不删除旧表数据。
- 大量 URL 导致页面卡顿：首版先按本地查询实现；如数据量变大，再增加分页或限制展示数量。
- 商品名称变更导致重复记录：首版按 PRD 使用 `[name+url]` 唯一判断，不额外引入 SKU ID 推断。

## 5. 完成定义

开发完成需要同时满足：

- 页面能完成 Excel 导入、URL 列表展示、商品名称查询、URL 查询和 URL 列表点击交互。
- 工作流能批量更新商品价格和库存。
- 缺失商品库存置 `0` 的规则已实现。
- `src/api.ts` 未发生任何修改。
- `pnpm run build:pages` 通过。
- `pnpm run build` 通过。
- PRD 中所有验收标准均可手工验证。
