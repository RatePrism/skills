import { resolveAcceptLanguage } from "./common.mjs";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(350 * (attempt + 1));
    }
  }
  throw lastErr;
}

function authHeaders(cfg) {
  const h = { Accept: "application/json" };
  if (cfg.token) h.Authorization = `Bearer ${cfg.token}`;
  return h;
}

export async function searchSuggestion(query, cfg, acceptLanguageRaw) {
  const acceptLanguage = resolveAcceptLanguage(acceptLanguageRaw);
  const q = new URLSearchParams({ query, limit: String(cfg.suggestionLimit) });
  const url = `${cfg.baseUrl}/search/suggestion?${q}`;
  const headers = { ...authHeaders(cfg), "Accept-Language": acceptLanguage };
  const res = await fetchWithRetry(url, {
    headers,
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`suggestion HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("suggestion: invalid JSON");
  }
  if (body.code !== 0 && body.code !== 200) {
    throw new Error(body.msg || `suggestion code ${body.code}`);
  }
  return Array.isArray(body.result) ? body.result : [];
}

export async function getHotelIdFromTripId(tripHotelIds, cfg) {
  if (!Array.isArray(tripHotelIds) || tripHotelIds.length === 0) {
    throw new Error("trip/eps requires non-empty tripHotelIds array");
  }
  const ids = tripHotelIds
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error("trip/eps requires at least one valid trip id");
  }
  const url = `${cfg.baseUrl}/hotel/trip/eps`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { ...authHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`trip/eps HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  let wrapped;
  try {
    wrapped = JSON.parse(text);
  } catch {
    throw new Error("trip/eps: invalid JSON");
  }
  if (wrapped.code !== 0 && wrapped.code !== 200) {
    throw new Error(wrapped.msg || `trip/eps code ${wrapped.code}`);
  }
  const result = {};
  if (wrapped.result && typeof wrapped.result === "object") {
    for (const tripId of ids) {
      const mapped = wrapped.result[tripId];
      if (Array.isArray(mapped) && mapped.length > 0) {
        result[tripId] = String(mapped[0] ?? "").trim();
      } else if (mapped != null) {
        result[tripId] = String(mapped).trim();
      } else {
        result[tripId] = "";
      }
    }
  } else {
    for (const tripId of ids) result[tripId] = "";
  }
  return result;
}

export async function searchHotelRooms(params, cfg) {
  const {
    hotelId,
    checkInTime,
    checkOutTime,
    adults,
    children,
    countryCode,
    acceptLanguage,
  } = params;
  const q = new URLSearchParams();
  q.set("hotelId", hotelId);
  q.set("checkInTime", checkInTime);
  q.set("checkOutTime", checkOutTime);
  if (Array.isArray(adults)) {
    for (const a of adults) q.append("adults", String(a));
  } else if (adults != null && String(adults).trim() !== "") {
    q.append("adults", String(adults));
  }
  if (Array.isArray(children)) {
    for (const c of children) q.append("children", String(c));
  } else if (children != null && String(children).trim() !== "") {
    q.append("children", String(children));
  }
  if (countryCode) q.set("countryCode", countryCode);
  const url = `${cfg.baseUrl}/hotel/room?${q}`;
  const acceptLang = resolveAcceptLanguage(acceptLanguage);
  const headers = { ...authHeaders(cfg), "Accept-Language": acceptLang };
  const res = await fetchWithRetry(url, {
    headers,
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`room HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  let wrapped;
  try {
    wrapped = JSON.parse(text);
  } catch {
    throw new Error("room: invalid JSON");
  }
  if (wrapped.code !== 0 && wrapped.code !== 200) {
    throw new Error(wrapped.msg || `room code ${wrapped.code}`);
  }
  return normalizeHotelRoomResult(wrapped.result);
}

/**
 * `/hotel/room` `result`:
 * - Array: each item is a physical room type of the same hotel; `subRooms[]` are sellable
 *   variants of that room. `hotelName` is on room item level, not `subRooms`.
 * - Object: `{ hotelName?, rooms: [...] }` only; unknown shapes yield empty `rooms`.
 */
function normalizeHotelRoomResult(result) {
  if (result == null) return { hotelName: "", rooms: [] };
  if (Array.isArray(result)) {
    const normalizedRooms = result
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeRoomItem(item));
    const firstRoom = normalizedRooms[0];
    const hotelName = firstRoom ? pickHotelNameString(firstRoom) : "";
    return { hotelName, rooms: normalizedRooms };
  }
  if (typeof result !== "object") return { hotelName: "", rooms: [] };
  const rooms = Array.isArray(result.rooms)
    ? result
        .rooms
        .filter((item) => item && typeof item === "object")
        .map((item) => normalizeRoomItem(item))
    : [];
  const hotelName = rooms[0] ? pickHotelNameString(rooms[0]) : pickHotelNameString(result);
  return { hotelName, rooms };
}

function pickHotelNameString(obj) {
  const v = obj.hotelName;
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function normalizeRoomItem(room) {
  return {
    type: room.type,
    hotelId: room.hotelId,
    hotelName: pickHotelNameString(room),
    roomId: room.roomId,
    name: room.name,
    views: Array.isArray(room.views) ? room.views : [],
    subRooms: Array.isArray(room.subRooms)
      ? room.subRooms
          .filter((sub) => sub && typeof sub === "object")
          .map((sub) => normalizeSubRoomItem(sub))
      : [],
  };
}

function normalizeSubRoomItem(sub) {
  return {
    subRoomId: sub.subRoomId,
    refundAbility: sub.refundAbility,
    holdRooms: sub.holdRooms,
    amentities: Array.isArray(sub.amentities) ? sub.amentities : [],
    bedInfo: Array.isArray(sub.bedInfo) ? sub.bedInfo : [],
    roomPrice: Array.isArray(sub.roomPrice) ? sub.roomPrice : [],
    totalPrice: normalizeTotalPrice(sub.totalPrice),
    cancelPolicy: Array.isArray(sub.cancelPolicy) ? sub.cancelPolicy : [],
  };
}

function normalizeTotalPrice(totalPrice) {
  if (!totalPrice || typeof totalPrice !== "object") return null;
  return {
    currency: totalPrice.currency,
    pricing:
      totalPrice.pricing && typeof totalPrice.pricing === "object"
        ? { total: totalPrice.pricing.total }
        : null,
  };
}
