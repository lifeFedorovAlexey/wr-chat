import fs from "node:fs";
import path from "node:path";

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOriginList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;
    values[key] = value;
  }

  return values;
}

export function readConfig(env = process.env, cwd = process.cwd()) {
  const fileEnv = parseEnvFile(path.join(cwd, ".env"));
  const mergedEnv = {
    ...fileEnv,
    ...env,
  };

  return {
    serviceName: "wr-chat",
    version: mergedEnv.npm_package_version || "0.1.0",
    nodeEnv: String(mergedEnv.NODE_ENV || "development").trim() || "development",
    host: String(mergedEnv.HOST || "127.0.0.1").trim() || "127.0.0.1",
    port: normalizePort(mergedEnv.PORT, 3010),
    publicOrigin: String(mergedEnv.WR_CHAT_PUBLIC_ORIGIN || "").trim(),
    wrApiOrigin: String(mergedEnv.WR_API_ORIGIN || "").trim(),
    sharedSecret: String(mergedEnv.WR_CHAT_SHARED_SECRET || "").trim(),
    allowedOrigins: normalizeOriginList(mergedEnv.WR_CHAT_ALLOWED_ORIGINS),
  };
}
