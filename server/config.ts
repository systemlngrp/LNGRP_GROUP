import dotenv from "dotenv";

dotenv.config();

export const PORT = parseInt(process.env.PORT || "3000", 10);
export const AUTH_SECRET = process.env.AUTH_SECRET || "dev-auth-secret-change-me";
export const AUTH_TTL_SECONDS = Number(process.env.AUTH_TTL_SECONDS || 60 * 60 * 24);
export const GLOBAL_ITEM_RENAME_ALLOWED_EMAIL = "pankaj@bizskilledu.com";
export const NPD_SYNC_SECRET = String(process.env.NPD_SYNC_SECRET || "").trim();
// IMPORT_KEY is the shared secret name used by the manual order importer.
// Keep ORDER_SYNC_SECRET as a backwards-compatible override.
export const ORDER_SYNC_SECRET = String(process.env.ORDER_SYNC_SECRET || process.env.IMPORT_KEY || "").trim();
export const NPD_SYNC_ALLOWED_TAB = String(process.env.NPD_SYNC_ALLOWED_TAB || "NPD").trim();
export const NPD_SYNC_LOG_PREFIX = "[NPD_SYNC]";
export const TALLY_SYNC_SECRET = String(process.env.TALLY_SYNC_SECRET || "!Office1@").trim();
export const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
export const APP_BUILD_MARKER = "lngrp-erp-2026-09-08-npd-firm-wise-public-v2";
