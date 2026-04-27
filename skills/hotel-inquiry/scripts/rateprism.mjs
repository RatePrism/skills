#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  fail,
  isValidDate,
  loadInput,
  ok,
  parseAdults,
  parseChildren,
  truthy,
} from "./common.mjs";
import { getConfig } from "./config.mjs";
import { getHotelIdFromTripId, searchHotelRooms } from "./client.mjs";
import { resolveHotelIdByName } from "./get_hotel_id_by_name.mjs";
import { parseLowestPrice } from "./get_hotel_price.mjs";
import { buildSalesLinkFields } from "./get_hotel_sales_link.mjs";
import { getFilteredTripCityUrls, getTripHotelRankingFromPageUrl } from "./get_trip_rank.mjs";

function usage() {
  return [
    "Usage (only one primary mode):",
    "  1) Quote: exactly one of --hotelid=<id> | --hotelname=<name> | --tripid=<trip_hotel_id>",
    "     plus required --adults=2[,1] --checkin=YYYY-MM-DD --checkout=YYYY-MM-DD",
    "     [--children=...] [--country=CN] [--accept_language=en-US|zh-CN|ja-JP]",
    "     (--tripid uses POST /hotel/trip/eps; empty EPS -> unresolved response)",
    "  2) Full Trip city sitemap URLs:",
    "     --city or --cityrank [--force_refresh=true]",
    "  3) List page → ordered hotel ids in HTML (rank only, no stay params):",
    "     --trip_city_url=<url> (alias --city_url)",
    "",
    "Env: RATEPRISM_GATEWAY_URL, RATEPRISM_LINK_BASE_URL, RATEPRISM_API_TOKEN, RATEPRISM_TIMEOUT_MS,",
    "TRIP_SITEMAP_CACHE_TTL_SEC",
  ].join("\n");
}

function assertTripCityListUrl(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.toLowerCase();
    if (!host.endsWith("trip.com")) {
      return "trip_city_url hostname must be *.trip.com";
    }
    return null;
  } catch {
    return "trip_city_url is not a valid URL";
  }
}

function normalizeUrlForCompare(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.toString().replace(/\/$/, "");
  } catch {
    return String(u || "").trim().replace(/\/$/, "");
  }
}

async function runCityRank(cfg, forceRefresh) {
  const { urls, total, from_cache, expires_at } = await getFilteredTripCityUrls("", {
    forceRefresh,
    timeoutMs: cfg.timeoutMs,
  });
  ok({
    resolved: true,
    mode: "cityrank",
    city_urls: urls,
    total,
    from_cache,
    expires_at,
  });
}

async function runHotelQuote(cfg, input) {
  const checkin = String(input.checkin || "").trim();
  const checkout = String(input.checkout || "").trim();
  const hotelName = String(input.hotelname || "").trim();
  if (!isValidDate(checkin) || !isValidDate(checkout)) {
    fail("checkin and checkout must be YYYY-MM-DD");
    return;
  }
  if (input.adults == null || String(input.adults).trim() === "") {
    fail("--adults is required for quote");
    return;
  }
  let adults;
  let children;
  try {
    adults = parseAdults(input.adults);
    children = parseChildren(input.children);
  } catch (e) {
    fail(e.message);
    return;
  }
  if (children.length > 0 && children.length !== adults.length) {
    fail("children groups must match number of rooms (adults count)");
    return;
  }

  let hotelId = String(input.hotelid || input.hotel_id || "").trim();
  const tripIdForQuote = String(input.tripid || input.trip_id || "").trim();
  const nId = [hotelId, hotelName, tripIdForQuote].filter(Boolean).length;
  if (nId === 0) {
    fail("need exactly one of --hotelid, --hotelname, or --tripid");
    return;
  }
  if (nId > 1) {
    fail("use only one of --hotelid, --hotelname, or --tripid");
    return;
  }

  if (hotelName) {
    const resolved = await resolveHotelIdByName(hotelName, cfg, {
      acceptLanguage: input.accept_language || input.acceptLanguage,
    });
    if (!resolved.resolved) {
      ok({ ...resolved, stay: { checkin, checkout, adults, children } });
      return;
    }
    hotelId = resolved.hotel_id;
  } else if (tripIdForQuote) {
    let m;
    try {
      m = await getHotelIdFromTripId([tripIdForQuote], cfg);
    } catch (e) {
      ok({
        resolved: false,
        reason: "trip_eps_failed",
        tripid: tripIdForQuote,
        message: String(e.message || e),
        stay: { checkin, checkout, adults, children },
      });
      return;
    }
    hotelId = String(m[tripIdForQuote] || "").trim();
    if (!hotelId) {
      ok({
        resolved: false,
        reason: "trip_eps_empty",
        tripid: tripIdForQuote,
        message: "No EPS hotel id returned for this trip id.",
        stay: { checkin, checkout, adults, children },
      });
      return;
    }
  }

  const { hotelName: resolvedHotelName, rooms } = await searchHotelRooms(
    {
      hotelId,
      checkInTime: checkin,
      checkOutTime: checkout,
      adults,
      children,
      countryCode: input.country || input.country_code || "CN",
      acceptLanguage: input.accept_language || input.acceptLanguage,
    },
    cfg,
  );
  const price = parseLowestPrice(rooms);
  const hotelDisplayName = resolvedHotelName;
  const sales =
    rooms.length > 0
      ? buildSalesLinkFields(cfg, {
          hotelId,
          checkin,
          checkout,
          adults,
          children,
          countryCode: input.country || input.country_code || "CN",
          hotelDisplayName,
        })
      : {};
  ok({
    resolved: true,
    mode: "hotel_quote",
    hotel_id: hotelId,
    hotel_name: resolvedHotelName,
    checkin,
    checkout,
    adults,
    children,
    rooms,
    ...price,
    ...sales,
    hotelName: resolvedHotelName,
  });
}

async function runTripCityListRank(cfg, input) {
  const tripCityUrl = String(input.trip_city_url || input.city_url || "").trim();
  const err = assertTripCityListUrl(tripCityUrl);
  if (err) {
    fail(err);
    return;
  }
  const cityRank = await getFilteredTripCityUrls("", {
    forceRefresh: false,
    timeoutMs: cfg.timeoutMs,
  });
  const allowSet = new Set((cityRank.urls || []).map((u) => normalizeUrlForCompare(u)));
  if (!allowSet.has(normalizeUrlForCompare(tripCityUrl))) {
    fail("trip_city_url must come from --cityrank output in this run");
    return;
  }
  const rank = await getTripHotelRankingFromPageUrl(tripCityUrl, {
    pageTimeoutMs: Math.max(cfg.timeoutMs, 45000),
    cfgTimeoutMs: cfg.timeoutMs,
  });
  if (!rank.ok) {
    fail(rank.error || "trip city page failed");
    return;
  }
  let mapped;
  try {
    mapped = await getHotelIdFromTripId(rank.data.trip_hotel_ids, cfg);
  } catch (e) {
    fail(String(e.message || e));
    return;
  }
  const hotelIds = rank.data.trip_hotel_ids
    .map((tripId) => String(mapped[String(tripId)] || "").trim())
    .filter(Boolean);
  ok({
    resolved: true,
    mode: "city_list_rank",
    trip_city_url: tripCityUrl,
    hotel_ids: hotelIds,
    hotel_count: hotelIds.length,
  });
}

function countPrimaryModes(input) {
  let n = 0;
  if (truthy(input.city) || truthy(input.cityrank)) n++;
  if (String(input.trip_city_url || input.city_url || "").trim()) n++;
  if (
    String(input.hotelid || input.hotel_id || "").trim() ||
    String(input.hotelname || "").trim() ||
    String(input.tripid || input.trip_id || "").trim()
  ) {
    n++;
  }
  return n;
}

async function main() {
  let input;
  try {
    input = loadInput(process.argv.slice(2));
  } catch (e) {
    fail(e.message);
    return;
  }

  if (truthy(input.help) || truthy(input.h)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const cfg = getConfig();
  const modes = countPrimaryModes(input);
  if (modes > 1) {
    fail(
      "use only one primary mode (city/cityrank, trip_city_url, or hotelid/hotelname/tripid)\n\n" + usage(),
    );
    return;
  }
  if (modes === 0) {
    fail("missing mode\n\n" + usage());
    return;
  }

  try {
    if (truthy(input.city) || truthy(input.cityrank)) {
      await runCityRank(cfg, truthy(input.force_refresh));
      return;
    }
    if (String(input.trip_city_url || input.city_url || "").trim()) {
      await runTripCityListRank(cfg, input);
      return;
    }
    await runHotelQuote(cfg, input);
  } catch (e) {
    fail(String(e.message || e));
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
