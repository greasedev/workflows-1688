# 商品价格与库存监控开发计划

## 1. 当前代码状态

当前仓库已经具备商品价格与库存监控的基础业务能力：

- `docs/prd.md` 已定义商品价格与库存监控需求。
- `src/models/types.ts` 已定义 `Source`、`Product`、`ProductAlert` 和工作流摘要类型。
- `src/libs/db.ts` 已定义 Dexie 数据库和 `source`、`product`、`product_alert` 三张表。
- `src/pages` 已实现监控报警、Excel 导入、URL 监控列表和商品查询页面。
- `src/workflows/default_workflow.ts` 已实现 URL 批量处理、商品更新、缺失商品库存置零和商品命中记录写入。
- `src/api.ts` 已生成 `get_sku_list_from_url(product_url)` API client，只允许复用，绝对不能修改。

## 2. 实施顺序

### 2.1 数据模型与数据库

目标：先统一页面和工作流共享的数据结构，避免后续实现重复判断。

开发任务：

- 更新 `src/models/types.ts`：
  - `Source` 增加 `createdAt`、`updatedAt`、`lastCheckedAt`、`lastError`、`isInvalid`、`invalidAt`。
  - `Product` 增加 `spec`、`updatedAt`。
  - 增加 `ProductAlertHitType`，可选值为 `missing`、`price_increase`、`low_stock`。
  - 增加 `ProductAlert`，字段包括 `url`、`name`、`spec`、`hitTypes`、`previousPrice`、`currentPrice`、`previousStock`、`currentStock`、`stockThreshold`、`checkedAt`。
  - 增加工作流结果摘要类型，例如成功 URL 数、失败 URL 数、更新商品数、库存置零商品数、命中记录数和错误摘要。
- 更新 `src/libs/db.ts`：
  - 保留 `source` 表唯一 URL 约束。
  - 为 `source.isInvalid` 增加索引，支持工作流跳过失效 URL。
  - 保留 `product` 表 `[name+spec+url]` 唯一约束。
  - 为 `product.url`、`product.name`、`product.spec` 保留索引，支持 URL 查询、商品名称查询和规格存储。
  - 新增 `product_alert` 表，索引包含 `url`、`name`、`spec`、`checkedAt`、`[name+spec+url]`。
  - 如 schema 版本需要变更，使用新的 Dexie 版本迁移，避免破坏已有数据；规格字段升级使用 `[name+spec+url]` 约束。

验收点：

- 页面和工作流可以引用同一套类型。
- `source.url` 唯一。
- `product` 能按 `url` 和 `name` 查询。
- `product_alert` 能保存追加式商品命中记录，并可按 URL、商品名称、规格和检查时间查询。

### 2.2 Excel 导入能力

目标：实现用户通过 Excel 导入 URL 列表，固定读取 `上游1` 表头并合并去重。

开发任务：

- 新增依赖 `xlsx`，用于浏览器端解析 Excel。
- 在 `src/pages/index.ts` 中实现文件读取：
  - 读取第一个工作表。
  - 使用固定表头 `上游1`。
  - 缺少 `上游1` 表头时显示错误。
  - 对每个 URL 做 `trim`。
  - 过滤空值和明显非法 URL。
- 实现合并去重写入：
  - 已存在 URL 不重复插入。
  - 新 URL 写入 `source`，带上 `createdAt` 和 `updatedAt`。
  - 导入完成后展示新增 URL 数、重复 URL 数、无效或空 URL 数。

验收点：

- 上传包含 `上游1` 表头的 Excel 后，URL 被写入 `source`。
- 重复 URL 不重复插入。
- 缺少 `上游1` 表头时有明确错误提示。

### 2.3 Pages 页面 UI

目标：实现完整的 URL 监控列表和商品查询界面。

开发任务：

- 在 `src/pages/index.html` 中搭建页面结构：
  - 监控报警列表区域。
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
  - 加载 `ProductAlert` 列表。
  - 加载 URL 列表。
  - 按 URL 聚合商品数。
  - 加载商品查询结果。

监控报警列表交互：

- tab 顺序固定为 `监控报警`、`URL监控`、`商品查询`。
- 页面默认展示 `监控报警` tab，并在 tab 数字中展示当前报警总数。
- 监控报警列表读取 `product_alert` 表，并按 `checkedAt` 倒序展示；时间相同时按 `id` 倒序展示。
- 监控报警列表每页展示 20 条记录，分页只影响展示层。
- 每行展示商品名称、规格、命中类型、价格变化、库存变化、来源 URL 和检查时间。
- 命中类型映射为中文：`missing` 显示 `商品缺失`，`price_increase` 显示 `价格上涨`，`low_stock` 显示 `低库存`。
- 同一条报警命中多个类型时，在同一行展示全部命中类型。
- 价格或库存的新旧值为空时显示 `-`。
- 来源 URL 可点击打开原始页面。
- 商品查询搜索栏只在 `商品查询` tab 下显示。

URL 监控列表交互：

- URL 列表每页展示 20 条记录，分页只影响展示层。
- 分页栏展示当前范围和总数，并提供上一页、下一页操作。
- 每行展示 URL 和该 URL 已提取商品数。
- 每行提供 `标记失效` 或 `恢复有效` 操作。
- 失效 URL 状态列显示 `失效`，仍保留 URL 点击和商品数点击能力。
- 点击 URL：打开新页面展示该 URL 的原始页面内容。
- 点击商品数：跳转或切换到商品查询区域，并按该 URL 筛选商品。

商品查询交互：

- 支持商品名称模糊查询。
- 支持 URL 查询。
- 商品名称和 URL 同时存在时，结果必须同时满足两个条件。
- 商品查询搜索栏左侧显示 `已查询到xxx件商品。`，数量与当前筛选结果总数一致。
- 商品查询结果每页展示 20 条记录，并复用列表分页逻辑。
- 查询结果展示商品名称、价格、库存、来源 URL、更新时间。
- 商品信息列需要同时展示商品名称和规格。
- 没有匹配结果时展示空状态。

验收点：

- 打开页面默认展示 `监控报警`。
- 监控报警列表能显示报警总数和报警明细。
- 监控报警列表按检查时间倒序展示。
- 监控报警列表超过 20 条时可以通过上一页、下一页分页查看。
- URL 列表能显示 URL 和商品数。
- URL 列表超过 20 条时可以通过上一页、下一页分页查看。
- 点击 URL 会打开原始页面。
- 点击商品数会筛选商品查询结果。
- 商品查询支持名称、URL 以及二者组合过滤。
- 商品查询 tab 数字显示当前数据库中的商品总数。
- 商品查询搜索栏左侧结果数量文案与当前筛选结果总数一致。
- 商品查询结果超过 20 条时可以通过上一页、下一页分页查看。

### 2.4 Workflow 批量更新

目标：实现遍历所有待监控 URL，调用提取 API，并更新商品价格和库存。

开发任务：

- 更新 `src/workflows/default_workflow.ts` frontmatter：
  - 描述该工作流用于更新商品价格和库存。
  - 输出说明包含成功数、失败数、更新商品数、库存置零商品数、命中记录数和错误摘要。
- 实现工作流主逻辑：
  - 初始化 DB。
  - 读取 `source` 表中的所有 URL。
  - 跳过 `isInvalid === true` 的失效 URL，不调用提取 API。
  - 将有效 URL 按每批 10 个切分。
  - 批次之间串行执行，批次内使用 `Promise.all` 并发调用 `apis.get_sku_list_from_url(url)`。
  - 单个 URL 失败时记录错误并继续下一个 URL。
- 实现 API 结果解析：
  - 优先读取 `task.extract_data`。
  - 支持解析 JSON 字符串。
  - 优先从数组本身或 `products`、`skus`、`data` 字段中识别商品数组。
  - 跳过商品名称或规格为空的记录。
  - 将价格和库存转换为数字。
- 实现商品写入：
  - 同一 URL 下按 `[name+spec+url]` upsert。
  - 更新 `price`、`stock`、`updatedAt`。
  - 记录本次 URL 返回的商品名称和规格集合。
- 实现缺失商品库存置零：
  - 查询该 URL 下所有历史商品。
  - 历史商品如果本次同名同规格记录未出现，将 `stock` 更新为 `0`，并更新 `updatedAt`。
- 实现商品命中记录：
  - 每个 URL 获取到本次商品数据后，先查询该 URL 下所有历史商品。
  - 使用 `[name+spec+url]` 构建历史商品 Map 和本次商品 Map。
  - 历史商品本次不存在且历史库存不为 `0` 时，追加 `missing` 命中记录。
  - 历史商品价格低于本次价格时，追加 `price_increase` 命中记录。
  - 本次商品库存小于固定阈值 `100` 时，追加 `low_stock` 命中记录；库存等于 `100` 不命中。
  - 本次 API 返回的新品如果库存小于 `100`，也需要追加 `low_stock` 命中记录。
  - 同一商品同一轮命中多种情况时，只写入一条 `ProductAlert`，`hitTypes` 保存全部命中类型。
  - 商品命中记录采用追加模式，不覆盖历史记录。
  - 商品命中记录只保留 `checkedAt` 一个时间字段。
  - 新增命中记录、商品 upsert、缺失商品库存置零和成功状态更新应在同一 URL 的处理流程中完成；任一步失败时，该 URL 按失败处理并记录 `lastError`。
- 更新 URL 检查状态：
  - 成功时更新 `lastCheckedAt`，清空 `lastError`。
  - 失败时更新 `lastCheckedAt` 和 `lastError`。
- 返回工作流摘要：
  - 总 URL 数。
  - 成功 URL 数。
  - 失败 URL 数。
  - 跳过的失效 URL 数。
  - 更新商品数。
  - 库存置零商品数。
  - 新增商品命中记录数。
  - 错误摘要。

验收点：

- 工作流能遍历所有 `source` URL。
- 工作流每批最多处理 10 个有效 URL，当前批次全部完成后再执行下一批。
- API 返回多个商品时能分别写入或更新。
- 某个 URL 失败不阻断后续 URL。
- 本次未返回的历史商品库存变为 `0`。
- 商品缺失、价格上涨和低库存会追加写入 `product_alert`。
- 同一商品同一轮命中多种情况时，只新增一条命中记录。
- 工作流返回清晰摘要。

### 2.5 构建与验证

目标：确保页面和工作流均可构建，并覆盖核心业务场景。

开发任务：

- 运行页面构建：`pnpm run build:pages`。
- 运行工作流构建：`pnpm run build`。
- 如页面需要本地人工验证，运行：`pnpm run dev:pages`。

手工验证场景：

- 上传包含 `上游1` 表头的 Excel，确认新增 URL 和重复 URL 统计正确。
- 上传缺少 `上游1` 表头的 Excel，确认错误提示正确。
- URL 列表展示每条 URL 和商品数。
- URL 列表每页展示 20 条；21 条 URL 时第一页展示 20 条，第二页展示 1 条。
- 点击 `标记失效` 后，URL 状态显示 `失效`，工作流不再处理该 URL。
- 点击 `恢复有效` 后，该 URL 重新参与后续工作流处理。
- 页面默认进入 `监控报警` tab。
- 监控报警 tab 数字显示 `product_alert` 总数。
- 监控报警列表按 `checkedAt` 倒序展示；检查时间相同的记录按 `id` 倒序展示。
- 监控报警列表每页展示 20 条；21 条报警时第一页展示 20 条，第二页展示 1 条。
- 监控报警列表中 `hitTypes` 多值时在同一行显示全部中文标签。
- 监控报警列表中价格或库存的新旧值为空时显示 `-`。
- 切换到 `URL监控` 或 `监控报警` 时，商品查询搜索栏隐藏；切换到 `商品查询` 时搜索栏显示。
- 点击 URL 打开原始 URL 页面。
- 点击商品数进入商品查询并筛选该 URL 商品。
- 输入商品名称关键字进行模糊查询。
- 输入 URL 查询对应商品。
- 同时输入商品名称和 URL，确认使用组合过滤。
- 商品查询搜索栏左侧文案随筛选条件变化更新；清空筛选后显示 `已查询到0件商品。`。
- 商品查询结果每页展示 20 条；筛选条件变化后回到第 1 页。
- 工作流处理多个 URL，其中一个失败时整体继续执行。
- 工作流遇到失效 URL 时跳过，并在摘要中统计跳过数量。
- 工作流按每批 10 个有效 URL 执行；11 个有效 URL 会先并发处理前 10 个，全部完成后再处理第 11 个。
- 工作流重新抓取后，缺失商品库存更新为 `0`。
- 工作流重新抓取后，历史商品本次缺失且历史库存不为 `0` 时，`product_alert` 追加 `missing` 记录。
- 工作流重新抓取后，历史商品已是 `stock = 0` 且本次仍缺失时，不重复追加 `missing` 记录。
- 工作流发现历史商品价格低于本次价格时，`product_alert` 追加 `price_increase` 记录。
- 工作流发现本次商品库存为 `99` 时，`product_alert` 追加 `low_stock` 记录；库存为 `100` 时不追加。
- 同一商品同时价格上涨且低库存时，`product_alert` 只新增一条记录，`hitTypes` 同时包含 `price_increase` 和 `low_stock`。
- 重复运行工作流且持续满足命中条件时，`product_alert` 按轮次追加新记录，不覆盖旧记录。

## 3. 文件级改动清单

预计修改或新增文件：

- `package.json`、`pnpm-lock.yaml`：新增 `xlsx` 依赖。
- `src/models/types.ts`：扩展 `Source`、`Product` 类型，新增 `ProductAlertHitType`、`ProductAlert` 和工作流命中记录统计字段。
- `src/libs/db.ts`：更新 Dexie schema 和索引，新增 `product_alert` 表。
- `src/pages/index.html`：新增页面结构，包括监控报警列表。
- `src/pages/index.ts`：实现监控报警、Excel 导入、URL 列表、商品查询和交互逻辑。
- `src/pages/index.css`：实现页面样式。
- `src/workflows/default_workflow.ts`：实现批量 URL 处理和商品更新工作流。

禁止修改文件：

- `src/api.ts`：该文件是自动生成的 API client，开发中只能通过现有 `createWorkflowApis(agent).get_sku_list_from_url(product_url)` 调用，不能编辑、重生成或格式化该文件。

## 4. 风险与处理策略

- API 返回结构不稳定：实现解析函数，兼容数组、`products`、`skus`、`data` 等常见结构；无法识别时记录 URL 错误并继续。
- Excel 内容不规范：固定要求 `上游1` 表头；空 URL 和非法 URL 不导入，并在导入结果中统计。
- IndexedDB schema 升级：如果已有用户数据，使用 Dexie 新版本迁移，不删除旧表数据。
- 大量 URL 导致页面卡顿：URL 监控列表和商品查询结果均按每页 20 条分页；商品查询仍按本地查询实现。
- 商品名称或规格变更导致重复记录：首版按 PRD 使用 `[name+spec+url]` 唯一判断，不额外引入 SKU ID 推断。
- 商品命中记录增长较快：当前按业务要求采用追加模式；后续如果需要页面展示或清理策略，再增加查询分页和保留周期能力。

## 5. 完成定义

开发完成需要同时满足：

- 页面能完成 Excel 导入、URL 列表展示、商品名称查询、URL 查询和 URL 列表点击交互。
- 工作流能批量更新商品价格和库存。
- 缺失商品库存置 `0` 的规则已实现。
- 商品缺失、价格上涨和低库存命中记录已写入 `product_alert`。
- `src/api.ts` 未发生任何修改。
- `pnpm run build:pages` 通过。
- `pnpm run build` 通过。
- PRD 中所有验收标准均可手工验证。
