/**
 * Jump `p` payload + checksum must match `cheapoi/web/src/app/jump/page.tsx`:
 * camelCase fields, FNV-1a on UTF-16 code units (same as `hashJumpPayload` there).
 */

export function hashJumpPayload(input) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16);
}

/** Same key order and defaults as `buildPayloadChecksumSource` in jump/page.tsx. */
function buildPayloadChecksumSourceJson(payload) {
  return JSON.stringify({
    target: payload.target ?? "",
    type: payload.type ?? "",
    value: payload.value ?? "",
    destinationName: payload.destinationName ?? "",
    hotelId: payload.hotelId ?? "",
    checkIn: payload.checkIn ?? "",
    checkOut: payload.checkOut ?? "",
    adults: payload.adults ?? [],
    children: payload.children ?? [],
    currency: payload.currency ?? "",
    countryCode: payload.countryCode ?? "",
  });
}

export function buildJumpQueryPath(raw) {
  const adultsStr = (raw.adults || []).map((a) => String(a));
  const childrenStr = (raw.children || []).map((c) => String(c ?? ""));
  const hotelIDForPayload = String(raw.hotelId || raw.value || "");

  const checksumInput = {
    target: raw.target ?? "",
    type: raw.type ?? "",
    value: raw.value ?? "",
    destinationName: raw.destinationName ?? "",
    hotelId: hotelIDForPayload,
    checkIn: raw.checkIn ?? "",
    checkOut: raw.checkOut ?? "",
    adults: adultsStr,
    children: childrenStr,
    currency: raw.currency ?? "",
    countryCode: raw.countryCode ?? "",
  };
  const checksum = hashJumpPayload(buildPayloadChecksumSourceJson(checksumInput));
  const payload = { ...checksumInput, checksum };
  const p = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `/jump?p=${encodeURIComponent(p)}`;
}

/** Used by `rateprism.mjs` / `get_hotel_price.mjs` so quotes include the same jump URL as this script. */
export function buildSalesLinkFields(cfg, payload) {
  const {
    hotelId,
    checkin,
    checkout,
    adults,
    children = [],
    countryCode = "",
    hotelDisplayName = "",
  } = payload;

  const dest = String(hotelDisplayName || "").trim();

  const adultsNums = adults.map((a) =>
    typeof a === "number" ? a : parseInt(String(a), 10),
  );

  let jumpChildren = [];
  if (Array.isArray(children)) {
    if (children.length === adultsNums.length) {
      jumpChildren = children.map((c) => String(c ?? ""));
    } else if (adultsNums.length === 1 && children.length > 0) {
      jumpChildren = [children.join(",")];
    }
  }

  const path = buildJumpQueryPath({
    target: "/hotels/search",
    type: "hotel",
    value: String(hotelId),
    hotelId: String(hotelId),
    destinationName: dest,
    checkIn: checkin,
    checkOut: checkout,
    adults: adultsNums,
    children: jumpChildren,
    currency: "USD",
    countryCode: String(countryCode || ""),
  });

  const url = `${cfg.linkBaseURL}${path}`;
  return { sales_link: url };
}

