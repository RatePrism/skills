import process from "node:process";
import { toInt } from "./common.mjs";

const RATEPRISM_GATEWAY_URL = process.env.RATEPRISM_GATEWAY_URL || "https://agent.rateprism.com/agent";
const RATEPRISM_API_TOKEN = process.env.RATEPRISM_API_TOKEN || process.env.RATEPRISM_TOKEN || "";
const RATEPRISM_TIMEOUT_MS = toInt(process.env.RATEPRISM_TIMEOUT_MS, 60000);
const RATEPRISM_LINK_BASE_URL =
  process.env.RATEPRISM_LINK_BASE_URL || "https://meta.rateprism.com";
const RATEPRISM_SUGGESTION_LIMIT = Math.max(1, toInt(process.env.RATEPRISM_SUGGESTION_LIMIT, 20));

export function getConfig() {
  const baseUrl = RATEPRISM_GATEWAY_URL.trim().replace(/\/+$/, "");
  const token = RATEPRISM_API_TOKEN.trim();
  const timeoutMs = RATEPRISM_TIMEOUT_MS > 0 ? RATEPRISM_TIMEOUT_MS : 60000;
  const linkBaseURL = RATEPRISM_LINK_BASE_URL.trim().replace(/\/+$/, "");
  return {
    baseUrl,
    token,
    timeoutMs,
    linkBaseURL,
    suggestionLimit: RATEPRISM_SUGGESTION_LIMIT,
  };
}
