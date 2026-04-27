---
name: hotel-inquiry
description: 当用户需要酒店报价、比价、预订链接，或基于入住/离店日期的住宿推荐时使用。
---

# 酒店询价（Hotel Inquiry）

将 **`rateprism` 视为黑盒**：参数与流程以本 Skill 为准，仅从 CLI 输出读取数字与 **`sales_link`**；不要通过读源码「理解实现」。

## 三种调用（互斥，单次只选一种）

### 1 — 获取酒店价格（含 **`sales_link`**）

```text
rateprism --hotelid <hotelid> --hotelname <hotelname> --tripid <tripid> --checkin <checkin> --checkout <checkout> --adults <adults> [--children <children>] [--accept_language <accept_language>]
```

- **`hotelid` | `hotelname` | `tripid`**：三者**必选一个**，且**互斥**。
- **`hotelname`**：工具内部会走 suggestion 解析出 `hotelid`；**解析不到则直接空结果**，不要自行编造 id。
- **`tripid`**：工具内部会 Trip→EPS 解析出 `hotelid`；**解析不到则直接空结果**。
- **`checkin` | `checkout` | `adults`**：询价必填；**`children`** 选填。
- **`accept_language`**：随用户语种选 **`zh-CN` / `ja-JP` / `en-US`**（无法用前述语种时用 **`en-US`** 兜底）。

成功时结果里带有 **`sales_link`**（预订跳转链）。

### 2 — 获取 sitemap 城市列表

```text
rateprism --cityrank
```

返回城市列表页 URL 等；步骤 3 使用的 URL **必须**来自本次 **2** 的输出。

### 3 — 按列表页 URL 获取酒店列表（`tripid` 与酒店名）

```text
rateprism --trip_city_url <trip_city_url>
```

从给定 Trip 列表页 URL 得到有序的酒店 **`tripid`** 与名称等信息（**本步不产生房价、不产生 `sales_link`**）。

## 业务路径

**按酒店**

1. 调用 **1** → 从结果取价与 **`sales_link`**。

**按城市**

1. 调用 **2** → 拿 sitemap；
2. 助手**选一个**合适列表页 URL；
3. 调用 **3** → 拿 **`tripid`**（及酒店名等）；
4. 当 **3** 返回的 **`tripid` 不少于 10 个**时，对其中**至少 10 家**各调用 **1**（按列表顺序，例如前 10 个，**禁止**只跑 6 家等提前收尾）。若 **3** 返回**不足 10 个** id，则对**返回的每家**都调用 **1**。若仍要对用户展示更多酒店，则对展示的每家再跑 **1**。仅展示 **1** 成功返回的价与 **`sales_link`**。
5. 若**全部** **1** 的调用都没有可展示的报价（没有任何一家拿到可用的价 + **`sales_link`**），则**明确告知用户：当前暂无酒店报价**（或等价白话），**不要**编造价格或链接。

## 助手规则

- 数字价与 **`sales_link`** 只认 CLI 成功输出；对用户不贴 JSON、不解释黑盒内部步骤。
- 凡对用户展示可预订的酒店内容：**每家**须有成功 **1** 返回的价与 **`sales_link`**（不能只用 **3** 的列表当报价）。**按城市：**当 **`tripid` 不少于 10 个时，至少对 10 家执行步骤 4**；若全部询价均无可用结果，告知用户**暂无酒店报价**。
- 预订链接只用输出里的 **`sales_link`**，且须为含 **`/jump?p=`** 的 jump；不要用 Trip 详情页、不要用原始 **`rooms`** 当预订 href。
- **`trip_city_url` 来源强约束：**必须取自紧邻上一步 **`--cityrank`** 的输出；禁止手写/猜测/改写域名或路径。

## 对用户回复版式（助手 → 用户）

**每家酒店按下列顺序写一遍**（多家酒店则重复该结构）。与用户语言一致；**`accept_language`** 见上。表格中的数字仅来自成功 CLI 返回。

1. **第一行 — 酒店名与售卖链接：** **`酒店名（[售卖链接文案](sales_link)）`** — 链接的 href 必须是 **`sales_link`**（含 **`/jump?p=`** 的 jump）。
2. **第二行 — 入离与入住人数：** 入住日、离店日，以及每房成人数、儿童（若有），写清楚一行。
3. **第三行起 — 价格表格**（Markdown 表）：

   **房型 | 可退最低限价 | 不可退最低价**

   - 每种房型一行；某列无报价时用 **`-`**。

未解析成功：简短追问，不报「已确认价」、不给预订链。

**按城市**若全部询价均无可用结果：向用户说明**暂无酒店报价**（与上文业务路径步骤 5 一致）。

## CLI 输出（仅助手）

一行 JSON；自行解析，勿贴给用户。

## 环境变量

配置网关、链接域名、超时等（如 **`RATEPRISM_GATEWAY_URL`**、**`RATEPRISM_API_TOKEN`**、**`RATEPRISM_LINK_BASE_URL`** 等），以部署环境为准；细节见 **`rateprism --help`** 或运维说明，Skill 不展开。

## 本仓库中的命令路径

若未全局安装 `rateprism`，可在仓库内使用：

```bash
node skills/hotel-inquiry/scripts/rateprism.mjs …
```

参数与上表一致。
