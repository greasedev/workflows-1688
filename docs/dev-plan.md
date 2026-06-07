# 商品价格与库存监控开发计划

## 1. 当前代码状态

当前仓库已经具备商品价格与库存监控的基础业务能力：

- `docs/prd.md` 已定义商品价格与库存监控需求。
- `src/models/types.ts` 已定义 `Source`、`Product`、`ProductAlert`、`AppSettings` 和工作流摘要类型。
- `src/libs/db.ts` 已定义 Dexie 数据库和 `source`、`product`、`product_alert`、`settings` 表。
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
  - 增加 `AppSettings`，字段包括 `id`、`monitorHourlyRate`、`stockAlertThreshold`、`enabledAlertTypes`、`updatedAt`。
  - 增加工作流结果摘要类型，例如成功 URL 数、失败 URL 数、更新商品数、库存置零商品数、命中记录数和错误摘要。
- 更新 `src/libs/db.ts`：
  - 保留 `source` 表唯一 URL 约束。
  - 为 `source.isInvalid` 增加索引，支持工作流跳过失效 URL。
  - 保留 `product` 表 `[name+spec+url]` 唯一约束。
  - 为 `product.url`、`product.name`、`product.spec` 保留索引，支持 URL 查询、商品名称查询和规格存储。
  - 新增 `product_alert` 表，索引包含 `url`、`name`、`spec`、`checkedAt`、`[name+spec+url]`。
  - 新增 `settings` 表，使用 `id = global` 保存唯一全局设置记录，索引为 `&id, updatedAt`。
  - 如 schema 版本需要变更，使用新的 Dexie 版本迁移，避免破坏已有数据；规格字段升级使用 `[name+spec+url]` 约束。
- 新增共享设置 helper：
  - 默认值为 `monitorHourlyRate = 180`（每分钟 3 个）、`stockAlertThreshold = 100`，三类报警默认全部激活。
  - `monitorHourlyRate` 校验范围为 `1-360`。
  - `stockAlertThreshold` 必须为大于等于 `1` 的整数。
  - `enabledAlertTypes` 至少包含一个有效报警类型；旧设置缺失该字段时自动补齐全部报警类型。
  - 页面和 workflow 均通过 helper 读取设置，首次缺失时写入默认设置。

验收点：

- 页面和工作流可以引用同一套类型。
- `source.url` 唯一。
- `product` 能按 `url` 和 `name` 查询。
- `product_alert` 能保存追加式商品命中记录，并可按 URL、商品名称、规格和检查时间查询。
- `settings` 能保存并读取页面和工作流共享的全局参数。

### 2.2 Excel 导入能力

目标：实现用户通过 Excel 导入 URL 列表，扫描第一个工作表的全部单元格并合并去重。

开发任务：

- 新增依赖 `xlsx`，用于浏览器端解析 Excel。
- 在 `src/pages/index.ts` 中实现文件读取：
  - 读取第一个工作表。
  - 扫描全部单元格，包括首行，不要求固定表头或固定 URL 列。
  - 对每个单元格内容做 `trim`，仅接受内容整体为完整绝对 URL 的记录。
  - 忽略空值、普通文本和不完整 URL，仅导入 `http` 或 `https` 的 `1688.com`、`jinritemai.com` 及其子域名 URL。
- 实现合并去重写入：
  - 已存在 URL 不重复插入。
  - 新 URL 写入 `source`，带上 `createdAt` 和 `updatedAt`。
  - 导入完成后展示新增 URL 数、重复 URL 数、无效或空 URL 数。

验收点：

- 上传 URL 分布在不同列或首行的 Excel 后，符合要求的 URL 被写入 `source`。
- 重复 URL 不重复插入。
- Excel 不包含固定表头时仍可正常导入。

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
- 每行展示 `No.` 序号、商品名称、规格、命中类型、来源 URL 和检查时间。
- 命中类型映射为中文：`missing` 显示 `商品下架`，`price_increase` 显示 `价格上涨`，`low_stock` 显示 `低库存`。
- 同一条报警命中多个类型时，在同一个命中类型单元格中按每种类型一行展示。
- `price_increase` 类型行展示带人民币标识 `¥` 的价格变化，`low_stock` 类型行展示不带币种的库存变化。
- 价格或库存的新旧值为空时显示 `-`。
- 来源 URL 可点击打开原始页面。
- 商品查询搜索栏只在 `商品查询` tab 下显示。
- 在 `导入URL` 按钮旁提供 `生成测试报警` 按钮。
- 在 `导入URL` 按钮右侧提供 `设置` 按钮。
- 设置弹窗参考 `demo` 的设置界面结构和样式，包含 `每小时监控速率`、`库存预警值` 和三类报警激活复选框。
- 打开设置弹窗时读取 `settings` 表；保存时写入全局设置记录。
- 设置保存校验：每小时监控速率为 `1-360`，库存预警值为大于等于 `1` 的整数，并至少激活一种报警类型。
- 点击 `生成测试报警` 时读取 `Product` 表；如果没有商品，弹窗提示 `暂无商品数据，无法生成测试报警。`，不修改 `product_alert`。
- 如果存在商品，先清空 `product_alert` 表，再按已有商品循环构造 20 条 `ProductAlert` 测试数据。
- 测试数据的命中类型按固定模式循环：`missing`、`price_increase`、`low_stock`、`price_increase + low_stock`。
- 测试数据的 `stockThreshold` 和低库存样例值从数据库中的 `库存预警值` 生成，不使用页面硬编码阈值。
- 测试数据的 `checkedAt` 从当前时间开始向前递减生成，保证列表按时间倒序稳定展示。
- 点击生成完成后切换到 `监控报警` tab，回到第 1 页并刷新报警总数和列表。

URL 监控列表交互：

- URL 列表每页展示 20 条记录，分页只影响展示层。
- 分页栏展示当前范围和总数，并提供上一页、下一页操作。
- 每行展示 `No.` 序号、URL 和该 URL 已提取商品数。
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
- 查询结果展示 `No.` 序号、商品名称、价格、库存、来源 URL、更新时间。
- 商品查询库存列中，`stock = 0` 展示为 `库存不足`，数据库字段仍保持数字 `0`。
- 价格展示统一带人民币标识 `¥`，库存等非价格数字不带币种。
- 商品信息列需要同时展示商品名称和规格。
- 没有匹配结果时展示空状态。

验收点：

- 打开页面默认展示 `监控报警`。
- 监控报警列表能显示报警总数和报警明细。
- 监控报警列表按检查时间倒序展示。
- 监控报警列表超过 20 条时可以通过上一页、下一页分页查看。
- 监控报警、URL 监控、商品查询三个列表均展示 `No.` 列；序号按当前列表排序和分页后的全局位置计算，第 2 页第一条显示为 `21`。
- 点击 `生成测试报警` 能基于 `Product` 表生成 20 条报警测试数据。
- 点击 `设置` 能打开参数设置弹窗；保存后刷新页面仍能读取保存值。
- `index.ts` 中生成测试报警不保留业务使用的 `LOW_STOCK_THRESHOLD` 硬编码。
- `Product` 表为空时，点击 `生成测试报警` 只显示错误提示，不清空或写入报警。
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
  - 读取 `settings` 表中的全局设置。
  - 按域名拆分有效 URL；先将全部 jinritemai URL 通过 `JSON.stringify` 转为数组字符串并调用一次批量接口，再逐个处理其他 URL。
  - jinritemai 批量结果按商品 `url` 字段匹配来源；非请求 URL 的返回商品忽略。
  - jinritemai 批量调用不参与 `monitorHourlyRate` 限速。
  - 根据 `monitorHourlyRate` 计算请求间隔：第一个 URL 立即请求，每次请求完成后用 `3600000 / monitorHourlyRate` 减去本次请求耗时得到实际等待时间；请求耗时超过间隔时，下一个 URL 立即请求。
  - 单个 URL 失败时记录错误并继续下一个 URL。
  - 如果 `task.extract_data` 可解析为数组且第一个元素为 `captcha-required`，写入当前 URL 中文错误并立即停止工作流，不处理后续 URL，不执行失败重试，最终返回 `message: "captcha-required"`。
  - jinritemai 批量调用失败时整批 URL 失败；首轮结束后仅将失败 URL 重新组成 JSON 数组批量重试一次。
  - jinritemai 批量返回缺少某个请求 URL 的可处理商品时，该 URL 失败且不修改历史商品。
- 实现 API 结果解析：
  - 优先读取 `task.extract_data`。
  - 识别 `["captcha-required"]` 和 JSON 字符串形式的 `"[\"captcha-required\"]"`。
  - 支持解析 JSON 字符串。
  - 优先从数组本身或 `products`、`skus`、`data` 字段中识别商品数组。
  - 跳过商品名称或规格为空的记录。
  - 将价格和库存转换为数字。
  - jinritemai 商品 `live_add_enum` 包含 `下架` 时视为显式下架，强制库存为 `0`。
  - jinritemai 显式下架商品允许缺少价格；已有商品保留历史价格，首次出现使用 `0`。
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
  - 本次商品库存小于 `stockAlertThreshold`，且无历史商品或历史库存不小于该阈值时，追加 `low_stock` 命中记录；库存等于阈值不命中。
  - 本次 API 返回的新品如果库存小于 `stockAlertThreshold`，也需要追加 `low_stock` 命中记录。
  - 同一商品同一轮命中多种情况时，只写入一条 `ProductAlert`，`hitTypes` 保存全部命中类型。
  - 命中类型按 `enabledAlertTypes` 过滤；过滤后为空时不写报警，但商品和来源状态仍正常更新。
  - jinritemai 显式下架商品只生成 `missing`；首次发现即下架也生成报警，历史库存已为 `0` 时不重复生成。
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
- 工作流批量处理 jinritemai URL，并逐个处理其他有效 URL。
- API 返回多个商品时能分别写入或更新。
- 某个 URL 失败不阻断后续 URL。
- 本次未返回的历史商品库存变为 `0`。
- 商品下架、价格上涨和低库存会追加写入 `product_alert`。
- 同一商品同一轮命中多种情况时，只新增一条命中记录。
- jinritemai 显式下架商品库存置 `0` 且只新增 `missing` 命中记录。
- 工作流返回清晰摘要。

### 2.5 构建与验证

目标：确保页面和工作流均可构建，并覆盖核心业务场景。

开发任务：

- 运行页面构建：`pnpm run build:pages`。
- 运行工作流构建：`pnpm run build`。
- 如页面需要本地人工验证，运行：`pnpm run dev:pages`。

手工验证场景：

- 上传 URL 分布在不同列或首行的 Excel，确认新增 URL 和重复 URL 统计正确。
- 上传不包含固定表头的 Excel，确认符合要求的 URL 仍能正常导入。
- URL 列表展示每条 URL 和商品数。
- URL 列表每页展示 20 条；21 条 URL 时第一页展示 20 条，第二页展示 1 条。
- 点击 `标记失效` 后，URL 状态显示 `失效`，工作流不再处理该 URL。
- 点击 `恢复有效` 后，该 URL 重新参与后续工作流处理。
- 页面默认进入 `监控报警` tab。
- 监控报警 tab 数字显示 `product_alert` 总数。
- 监控报警列表按 `checkedAt` 倒序展示；检查时间相同的记录按 `id` 倒序展示。
- 监控报警列表每页展示 20 条；21 条报警时第一页展示 20 条，第二页展示 1 条。
- 监控报警列表中 `hitTypes` 多值时，在同一个命中类型单元格中按每种类型一行展示。
- 价格上涨行显示带 `¥` 的价格变化，低库存行显示不带币种的库存变化。
- 监控报警列表中价格或库存的新旧值为空时显示 `-`。
- 点击 `生成测试报警` 后会清空旧报警并生成 20 条新报警。
- 生成的测试报警覆盖 `missing`、`price_increase`、`low_stock`、`price_increase + low_stock`。
- 商品数量少于 20 条时，仍循环复用已有商品生成 20 条报警。
- 切换到 `URL监控` 或 `监控报警` 时，商品查询搜索栏隐藏；切换到 `商品查询` 时搜索栏显示。
- 点击 URL 打开原始 URL 页面。
- 点击商品数进入商品查询并筛选该 URL 商品。
- 输入商品名称关键字进行模糊查询。
- 输入 URL 查询对应商品。
- 同时输入商品名称和 URL，确认使用组合过滤。
- 商品查询列表价格列显示人民币标识 `¥`；库存大于 `0` 时显示数字且不显示币种，库存为 `0` 时显示 `库存不足`。
- 设置弹窗首次打开显示默认值：每小时监控速率 `180`，库存预警值 `100`。
- 设置弹窗保存后刷新页面仍显示保存值。
- 设置弹窗拒绝每小时监控速率 `<1`、`>360` 或库存预警值 `<1` 的输入。
- 设置弹窗首次打开时三类报警全部激活，保存后刷新仍保持选择；全部取消时拒绝保存。
- 修改库存预警值后生成测试报警，新报警的 `stockThreshold` 使用保存后的值，低库存样例小于该值。
- 商品查询搜索栏左侧文案随筛选条件变化更新；清空筛选后显示 `已查询到0件商品。`。
- 商品查询结果每页展示 20 条；筛选条件变化后回到第 1 页。
- 工作流处理多个 URL，其中一个失败时整体继续执行。
- 工作流遇到失效 URL 时跳过，并在摘要中统计跳过数量。
- 工作流先批量处理全部 jinritemai URL，再逐个处理其他有效 URL；jinritemai 批量调用不参与限速，首轮结束后仅批量重试失败的 jinritemai URL，其他失败 URL 再逐个重试一次。
- jinritemai 批量结果按商品 `url` 字段写入对应来源；未返回可处理商品的请求 URL 失败且历史商品保持不变。
- jinritemai 商品 `live_add_enum` 包含 `下架` 时库存更新为 `0`，首次下架生成 `missing`，重复下架不重复报警。
- 工作流遇到 `["captcha-required"]` 时，当前 URL 写入中文 `lastError`，立即停止，不处理后续 URL，不执行失败重试，最终返回 `message: "captcha-required"`。
- 工作流重新抓取后，缺失商品库存更新为 `0`，商品查询列表展示为 `库存不足`。
- 工作流重新抓取后，历史商品本次缺失且历史库存不为 `0` 时，`product_alert` 追加 `missing` 记录。
- 工作流重新抓取后，历史商品已是 `stock = 0` 且本次仍缺失时，不重复追加 `missing` 记录。
- 工作流发现历史商品价格低于本次价格时，`product_alert` 追加 `price_increase` 记录。
- 工作流发现本次商品库存小于数据库中的 `stockAlertThreshold`，且无历史商品或历史库存不小于该阈值时，`product_alert` 追加 `low_stock` 记录；库存等于阈值时不追加。
- 同一商品同时价格上涨且低库存时，`product_alert` 只新增一条记录，`hitTypes` 同时包含 `price_increase` 和 `low_stock`。
- 禁用某类报警后，工作流仍更新对应商品状态但不新增该类型报警；已有历史报警继续展示。
- 重复运行工作流且持续满足价格上涨等命中条件时，`product_alert` 按轮次追加新记录，不覆盖旧记录；持续低库存状态不重复追加 `low_stock` 记录。

## 3. 文件级改动清单

预计修改或新增文件：

- `package.json`、`pnpm-lock.yaml`：新增 `xlsx` 依赖。
- `src/models/types.ts`：扩展 `Source`、`Product` 类型，新增 `ProductAlertHitType`、`ProductAlert` 和工作流命中记录统计字段。
- `src/libs/db.ts`：更新 Dexie schema 和索引，新增 `product_alert` 表。
- `src/pages/index.html`：新增页面结构，包括监控报警列表。
- `src/pages/index.ts`：实现监控报警、报警测试数据生成、Excel 导入、URL 列表、商品查询和交互逻辑。
- `src/pages/index.css`：实现页面样式。
- `src/workflows/default_workflow.ts`：实现批量 URL 处理和商品更新工作流。

禁止修改文件：

- `src/api.ts`：该文件是自动生成的 API client，开发中只能通过现有 `createWorkflowApis(agent).get_sku_list_from_url(product_url)` 调用，不能编辑、重生成或格式化该文件。

## 4. 风险与处理策略

- API 返回结构不稳定：实现解析函数，兼容数组、`products`、`skus`、`data` 等常见结构；无法识别时记录 URL 错误并继续。
- Excel 内容不规范：扫描第一个工作表全部单元格；普通文本、空值和不完整 URL 直接忽略，非支持域名 URL 不导入并在导入结果中统计。
- IndexedDB schema 升级：如果已有用户数据，使用 Dexie 新版本迁移，不删除旧表数据。
- 大量 URL 导致页面卡顿：URL 监控列表和商品查询结果均按每页 20 条分页；商品查询仍按本地查询实现。
- 商品名称或规格变更导致重复记录：首版按 PRD 使用 `[name+spec+url]` 唯一判断，不额外引入 SKU ID 推断。
- 商品命中记录增长较快：当前按业务要求采用追加模式；后续如果需要页面展示或清理策略，再增加查询分页和保留周期能力。

## 5. 完成定义

开发完成需要同时满足：

- 页面能完成 Excel 导入、URL 列表展示、商品名称查询、URL 查询和 URL 列表点击交互。
- 工作流能批量更新商品价格和库存。
- 缺失商品库存置 `0` 的规则已实现。
- 商品下架、价格上涨和低库存命中记录已写入 `product_alert`。
- `src/api.ts` 未发生任何修改。
- `pnpm run build:pages` 通过。
- `pnpm run build` 通过。
- PRD 中所有验收标准均可手工验证。
