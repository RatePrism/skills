import { searchSuggestion } from "./client.mjs";

const HOTEL_TYPES = new Set(["hotel", "property", "resort", "boutiquehotel", "apartmenthotel"]);

function isHotelSuggestion(s) {
  const t = String(s?.type || "").toLowerCase();
  return HOTEL_TYPES.has(t);
}

export async function resolveHotelIdByName(name, cfg, { acceptLanguage } = {}) {
  const q = String(name || "").trim();
  if (!q) {
    return { resolved: false, reason: "empty_query" };
  }
  const suggestions = await searchSuggestion(q, cfg, acceptLanguage);
  const hotels = suggestions.filter(isHotelSuggestion);
  if (hotels.length === 0) {
    return {
      resolved: false,
      reason: "no_hotel_suggestion",
      message:
        "No hotel-type suggestion returned; try a more specific hotel name, or use --cityrank then --trip_city_url for trip_hotel_ids, then --tripid with stay params per hotel.",
      raw_candidates: suggestions.slice(0, 20),
    };
  }
  if (hotels.length > 1) {
    return {
      resolved: false,
      reason: "multiple_hotels_found",
      message: "multiple hotels matched, please rerun with --hotelid",
      candidates: hotels.map((h) => ({
        type: h.type,
        value: h.value,
        place: h.place,
      })),
    };
  }
  const one = hotels[0];
  return {
    resolved: true,
    hotel_id: String(one.value),
    suggestion: one,
  };
}

