import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyConfigToProcessEnv, readConfig } from "../lib/config.mjs";

test("readConfig applies sane defaults", () => {
  const config = readConfig({});

  assert.equal(config.serviceName, "wr-chat");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3010);
  assert.deepEqual(config.allowedOrigins, []);
});

test("readConfig normalizes comma-separated origins", () => {
  const config = readConfig({
    WR_CHAT_ALLOWED_ORIGINS: " https://a.example , , https://b.example ",
    PORT: "4010",
  });

  assert.equal(config.port, 4010);
  assert.deepEqual(config.allowedOrigins, ["https://a.example", "https://b.example"]);
});

test("readConfig loads values from .env when process env is empty", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-chat-config-"));
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    ["PORT=4510", "WR_API_ORIGIN=https://api.example.com"].join("\n"),
    "utf8",
  );

  const config = readConfig({}, tempDir);

  assert.equal(config.port, 4510);
  assert.equal(config.wrApiOrigin, "https://api.example.com");
});

test("applyConfigToProcessEnv exposes file config to runtime modules", () => {
  const env = {};
  applyConfigToProcessEnv(
    {
      nodeEnv: "development",
      host: "127.0.0.1",
      port: 4510,
      publicOrigin: "http://127.0.0.1:4510",
      wrApiOrigin: "https://api.example.com",
      sharedSecret: "local-chat-secret",
      allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    },
    env,
  );

  assert.equal(env.PORT, "4510");
  assert.equal(env.WR_API_ORIGIN, "https://api.example.com");
  assert.equal(env.WR_CHAT_SHARED_SECRET, "local-chat-secret");
  assert.equal(env.WR_CHAT_ALLOWED_ORIGINS, "http://localhost:3000,http://127.0.0.1:3000");
});
