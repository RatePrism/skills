---
name: hotel-inquiry
description: Use when users need hotel quotes, price comparison, booking links, or stay recommendations with check-in and check-out dates.
---

# Hotel Inquiry

Treat **`rateprism` as a black box**: follow this SKILL for flags and flows; read numbers and **`sales_link`** from CLI output only. Do not read source to “understand” implementation.

## Three modes (mutually exclusive — one per run)

### 1 — Hotel price quote (includes **`sales_link`**)

```text
rateprism --hotelid <id> --hotelname <name> --checkin <YYYY-MM-DD> --checkout <YYYY-MM-DD> --adults <adults> [--children <children>] [--accept_language <tag>]
```

- **`--hotelid` | `--hotelname`**: **exactly one** required; **mutually exclusive**.
- **`--hotelname`**: tool resolves an internal hotel id via suggestion; **if it cannot, the result is empty** — do not invent ids.
- **`--checkin`**, **`--checkout`**, **`--adults`**: required for quoting; **`--children`** optional.
- **`--accept_language`**: match the user — **`zh-CN`**, **`ja-JP`**, or **`en-US`** (fallback **`en-US`**).

On success, output includes **`sales_link`** (booking jump URL).

### 2 — City sitemap list

```text
rateprism --cityrank
```

Returns city list-page URL candidates; mode **3** URL **must** be selected from this output.

### 3 — Hotel list from a Trip list URL (`hotelid` + names)

```text
rateprism --trip_city_url <url>
```

Returns ordered hotel **`hotelid`**s and names from that list page (**no room prices, no `sales_link`** in this step).

## Flows

**Single hotel**

1. Run **1** → use prices and **`sales_link`** from output.

**By city**

1. Run **2** → sitemap;
2. Choose one list URL;
3. Run **3** → **`hotelid`**s;
4. Run **1** for **at least 10** hotels when mode **3** returns **10 or more** **`hotelid`**s (use list order, e.g. the first 10 — do not stop early at 6). If mode **3** returns **fewer than 10** ids, run **1** for **every** id. For any **additional** hotel you still show the user, run **1** again. Only show prices and **`sales_link`** from successful runs.
5. If **all** mode **1** runs fail to produce a quotable hotel (no usable price + **`sales_link`** for any of them), tell the user plainly that **no hotel quotes are available** for this search — do not invent numbers or links.

## Agent rules

- Trust CLI output for amounts and **`sales_link`** only; never paste raw JSON to the user or explain black-box internals.
- Any user-facing bookable hotel line must come from a successful **1**: **price + `sales_link`**. Mode **3** alone is not a quote. **By city:** satisfy the **≥10** mode **1** attempts when enough **`hotelid`**s exist; if every attempt is empty, say **no quotes available**.
- Booking hrefs: only **`sales_link`** with **`/jump?p=`** from CLI — never Trip hotel detail URLs or raw **`rooms`** as links.
- **`trip_city_url` source is strict:** always take it from the immediately preceding **`--cityrank`** output; never handwrite/guess/modify domains or paths.

## User-facing reply

Use this layout **per hotel** (then repeat for the next hotel). Match the user’s language; **`--accept_language`** as above. Numbers only from successful CLI output.

1. **Line 1 — name + link:** **`Hotel name ([sales link text](sales_link))`** — the href must be **`sales_link`** (jump with **`/jump?p=`**).
2. **Line 2 — stay & guests:** check-in / check-out dates and occupancy (adults per room, children if any), one clear line.
3. **Line 3+ — price table** (markdown table):

   **`Room type` | `Lowest refundable price` | `Lowest non-refundable price`**

   - One row per distinct room type from the quote; use **`-`** when a column has no rate from the API.

If unresolved: short question — no “confirmed” table or booking link.

If **by city** every quote attempt failed: say **no hotel quotes are available** — same tone as step 5 in **Flows**.

## CLI stdout

One JSON line per run; parse internally; never paste into user chat.

## Environment

Gateway, link base URL, timeouts, tokens (e.g. **`RATEPRISM_GATEWAY_URL`**, **`RATEPRISM_API_TOKEN`**, **`RATEPRISM_LINK_BASE_URL`**) are deployment-specific; use **`rateprism --help`** or ops docs — not specified in depth here.

## Command path

If `rateprism` is not on `PATH`, run from the **skill root** (`hotel-inquiry/`, the directory that contains `SKILL.md`):

```bash
node scripts/rateprism.mjs …
```

If this skill lives inside a monorepo and your cwd is the **repository root**, use:

```bash
node skills/hotel-inquiry/scripts/rateprism.mjs …
```

Same flags as above.
