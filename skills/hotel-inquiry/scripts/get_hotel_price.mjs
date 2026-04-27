import { searchHotelRooms } from "./client.mjs";

function num(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseLowestPrice(rooms) {
  let lowest = null;
  let currency = "";
  let refundableHint = null;

  function visit(obj, depth) {
    if (obj == null || depth > 12) return;
    if (Array.isArray(obj)) {
      for (const x of obj) visit(x, depth + 1);
      return;
    }
    if (typeof obj !== "object") return;
    if (obj.totalPrice && typeof obj.totalPrice === "object") {
      const total = num(obj.totalPrice?.pricing?.total);
      if (total != null && (lowest == null || total < lowest)) {
        lowest = total;
        currency = String(obj.totalPrice?.currency || "").trim();
      }
    }
    if ("refundAbility" in obj) {
      const v = String(obj.refundAbility || "").toLowerCase();
      if (v === "refundable" || v === "partially_refundable") {
        refundableHint = true;
      } else if (v === "non_refundable") {
        refundableHint = false;
      }
    } else if ("freeCancel" in obj || "refundable" in obj) {
      refundableHint =
        obj.freeCancel === true || obj.refundable === true || obj.freeCancel === "true";
    }
    for (const v of Object.values(obj)) visit(v, depth + 1);
  }

  visit(rooms, 0);
  return {
    lowest_price: lowest,
    currency,
    refundable_hint: refundableHint,
  };
}

export async function getHotelPrice(params, cfg) {
  const { rooms, hotelName } = await searchHotelRooms(params, cfg);
  const parsed = parseLowestPrice(rooms);
  return { rooms, hotelName, ...parsed };
}
