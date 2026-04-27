import { readFileSync } from "node:fs";

export const BOOLEAN_CLI_FLAGS = new Set(["city", "cityrank", "force_refresh"]);

/** Flags that must not be written as `--flag=value` (except empty, `true`, or `1`). */
export const BOOLEAN_CLI_FLAGS_NO_VALUE = new Set(["city", "cityrank"]);

export function toInt(v, defaultValue) {
  if (v == null || v === "") return defaultValue;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export function ok(data) {
  process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
}

export function fail(message, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message, ...extra })}\n`);
  process.exitCode = 1;
}

export function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

export function parseAdults(raw) {
  if (raw == null || raw === "") return [2];
  const parts = String(raw)
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 1)) {
    throw new Error("adults must be comma-separated positive integers");
  }
  return nums;
}

export function parseChildren(raw) {
  if (raw == null || raw === "") return [];
  const s = String(raw).trim();
  if (!s) return [];

  const normalizeRoomChildren = (group) =>
    group
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .join(",");

  // Multi-room format: "2,3||0,1" => ["2,3", "", "0,1"]
  if (s.includes("|")) {
    return s.split("|").map((group) => normalizeRoomChildren(group.trim()));
  }

  // Single-room format: "2,3" => ["2,3"]
  const oneRoom = normalizeRoomChildren(s);
  return oneRoom ? [oneRoom] : [];
}

export function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    let key;
    let val;
    if (eq !== -1) {
      key = a.slice(2, eq);
      val = a.slice(eq + 1);
      if (BOOLEAN_CLI_FLAGS_NO_VALUE.has(key)) {
        const v = String(val).trim();
        if (v !== "" && v !== "true" && v !== "1") {
          throw new Error(`--${key} is a mode flag and does not accept a value; use --${key} alone`);
        }
        val = "true";
      }
    } else {
      key = a.slice(2);
      if (BOOLEAN_CLI_FLAGS.has(key)) {
        val = "true";
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          val = next;
          i++;
        } else {
          val = "true";
        }
      }
    }
    if (val === "true" || val === "false") {
      /* keep string; caller may interpret */
    }
    args[key] = val;
  }
  return args;
}

export function loadInput(argv) {
  const args = parseCliArgs(argv);
  let base = { ...args };
  const inputPath = args.input;
  if (inputPath) {
    try {
      const raw = readFileSync(inputPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = { ...parsed, ...args };
      }
    } catch (e) {
      throw new Error(`--input: ${e.message}`);
    }
  }
  return base;
}

export function loadObjectInput(argv) {
  const raw = argv[0];
  if (raw == null || String(raw).trim() === "") {
    throw new Error("expected one JSON object argument");
  }
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (e) {
    throw new Error(`invalid JSON object argument: ${e.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON argument must be an object");
  }
  return parsed;
}

export function truthy(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** Gateway only accepts these BCP-47 tags (same as MCP). */
export const ACCEPT_LANGUAGES = ["en-US", "zh-CN", "ja-JP"];

const ACCEPT_SET = new Set(ACCEPT_LANGUAGES);

/**
 * Resolve `Accept-Language` for hotel APIs. Unknown values fall back to
 * `RATEPRISM_ACCEPT_LANGUAGE` or `en-US`.
 */
export function resolveAcceptLanguage(raw) {
  const envRaw = String(process.env.RATEPRISM_ACCEPT_LANGUAGE || "").trim();
  const fallback = ACCEPT_SET.has(envRaw) ? envRaw : "en-US";
  if (raw == null || String(raw).trim() === "") return fallback;
  const s = String(raw).trim().replace(/_/g, "-");
  if (ACCEPT_SET.has(s)) return s;
  const lower = s.toLowerCase();
  if (lower === "en" || lower === "en-us") return "en-US";
  if (lower === "zh" || lower === "zh-cn") return "zh-CN";
  if (lower === "ja" || lower === "ja-jp") return "ja-JP";
  return fallback;
}
