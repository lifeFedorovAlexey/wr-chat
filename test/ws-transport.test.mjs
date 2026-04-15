import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { createAppServer } from "../app.mjs";
import {
  createSignedChatSessionToken,
  getChatSessionTtlMs,
} from "../lib/chatAuth.mjs";

const TEST_ENV = {
  WR_CHAT_SHARED_SECRET: "local-chat-secret",
};

test("websocket upgrade accepts valid session token and sends ready event", async () => {
  const previousSecret = process.env.WR_CHAT_SHARED_SECRET;
  process.env.WR_CHAT_SHARED_SECRET = TEST_ENV.WR_CHAT_SHARED_SECRET;

  const { server } = createAppServer();

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const sessionToken = createSignedChatSessionToken(
      {
        sub: "123",
        displayName: "Life",
        avatarUrl: "",
        roles: ["user"],
        exp: Date.now() + getChatSessionTtlMs(),
      },
      TEST_ENV,
    );

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionToken=${encodeURIComponent(sessionToken)}`);

      ws.on("message", (message) => {
        const payload = JSON.parse(String(message || ""));
        try {
          assert.equal(payload.type, "session:ready");
          assert.equal(payload.user.id, "123");
          ws.close();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      ws.on("error", reject);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));

    if (previousSecret == null) {
      delete process.env.WR_CHAT_SHARED_SECRET;
    } else {
      process.env.WR_CHAT_SHARED_SECRET = previousSecret;
    }
  }
});
