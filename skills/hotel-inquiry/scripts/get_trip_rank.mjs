import { gunzipSync } from "node:zlib";
import { fetchWithRetry } from "./client.mjs";

/** Same as rateprism-mcp/internal/mcpserver/trip_sitemap_cache.go */
export const TRIP_CITY_SITEMAP_URL = "https://trip.com/sitemap/en/hotels/ARK_CITY_TYPE/1.xml.gz";

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

let cache = {
  urls: null,
  expiresAt: 0,
};

function normalizeLoc(loc) {
  let u = String(loc || "").trim();
  if (!u) return "";
  return u.replaceAll("/resorts", "");
}

function parseSitemapLocs(xmlText) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    const loc = normalizeLoc(m[1]);
    if (loc) locs.push(loc);
  }
  const seen = new Set();
  const unique = [];
  for (const u of locs) {
    if (seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }
  return unique;
}

function ttlMs() {
  const sec = Number(process.env.TRIP_SITEMAP_CACHE_TTL_SEC);
  if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  return DEFAULT_TTL_MS;
}

async function downloadCityUrls(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchWithRetry(
      TRIP_CITY_SITEMAP_URL,
      {
        method: "GET",
        headers: { Accept: "application/xml,*/*" },
        signal: controller.signal,
      },
      2
    );
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      throw new Error(`trip sitemap http ${res.status}: ${buf.toString("utf8").slice(0, 500)}`);
    }
    const xmlText = gunzipSync(buf).toString("utf8");
    return parseSitemapLocs(xmlText);
  } finally {
    clearTimeout(timer);
  }
}

export async function getFilteredTripCityUrls(keyword, { forceRefresh = false, timeoutMs = 60000 } = {}) {
  const now = Date.now();
  let fromCache = false;
  if (!forceRefresh && cache.urls && now < cache.expiresAt) {
    fromCache = true;
  } else {
    const urls = await downloadCityUrls(timeoutMs);
    cache = {
      urls,
      expiresAt: now + ttlMs(),
    };
    fromCache = false;
  }

  const all = cache.urls || [];
  let filtered = all;
  if (String(keyword).trim()) {
    const low = String(keyword).toLowerCase();
    filtered = all.filter((u) => u.toLowerCase().includes(low));
  }

  return {
    urls: filtered,
    total: filtered.length,
    from_cache: fromCache,
    expires_at: new Date(cache.expiresAt).toISOString(),
  };
}

/**
 * MCP-compatible: keyword filter + offset/limit slice on filtered URLs.
 */
export async function listTripCityUrls({
  keyword = "",
  limit = 20,
  offset = 0,
  forceRefresh = false,
  timeoutMs = 60000,
} = {}) {
  const { urls: filtered, total, from_cache, expires_at } = await getFilteredTripCityUrls(keyword, {
    forceRefresh,
    timeoutMs,
  });
  let off = Math.max(0, Number(offset) || 0);
  if (off > total) off = total;
  const lim = Math.max(1, Number(limit) || 20);
  const end = Math.min(total, off + lim);
  const items = filtered.slice(off, end);

  return {
    items,
    count: items.length,
    total,
    offset: off,
    limit: lim,
    from_cache,
    expires_at,
  };
}

export function pickBestCityPageUrl(urls, cityKeyword) {
  if (!urls.length) return null;
  const plain = String(cityKeyword || "").toLowerCase().trim();
  const slug = plain.replace(/\s+/g, "-");
  let best = urls[0];
  let bestScore = -1;
  for (const url of urls) {
    const u = url.toLowerCase();
    let score = 0;
    if (plain && u.includes(plain)) score += 5;
    if (slug && u.includes(slug)) score += 8;
    if (plain && u.includes(`${plain}-hotels`)) score += 20;
    if (slug && u.includes(`${slug}-hotels`)) score += 20;
    if (/-hotels[-/]/i.test(url)) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

export async function fetchCityListHtml(pageUrl, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchWithRetry(
      pageUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RatePrismCityBot/1.0)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      },
      2
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`city page http ${res.status}: ${text.slice(0, 300)}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Trip list order: first occurrence of each numeric id in HTML (all unique ids on the page; no cap).
 * Paths are often `hotel-detail-<id>/<hotel-name-slug>`; the regex captures only the id.
 */
export function extractOrderedTripHotelIds(html) {
  const re = /hotel-detail-(\d+)/gi;
  const seen = new Set();
  const ids = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Given an exact Trip city/resort list page URL (chosen by agent), fetch HTML and return ordered trip_hotel_id[] (full list from HTML).
 */
export async function getTripHotelRankingFromPageUrl(pageUrl, options = {}) {
  const pageTimeoutMs = options.pageTimeoutMs ?? Math.max(options.cfgTimeoutMs || 8000, 45000);
  const u = String(pageUrl || "").trim();
  if (!u) {
    return { ok: false, error: "trip_city_url is required" };
  }

  let html;
  try {
    html = await fetchCityListHtml(u, pageTimeoutMs);
  } catch (err) {
    return {
      ok: false,
      error: `failed to fetch trip city page: ${String(err.message || err)}`,
    };
  }

  const tripHotelIds = extractOrderedTripHotelIds(html);
  if (tripHotelIds.length === 0) {
    return {
      ok: false,
      error: "no hotel-detail ids found on city page (layout may have changed)",
    };
  }

  return {
    ok: true,
    data: {
      trip_city_url: u,
      trip_city_url_candidates: 1,
      trip_hotel_ids: tripHotelIds,
      trip_hotel_count: tripHotelIds.length,
    },
  };
}
