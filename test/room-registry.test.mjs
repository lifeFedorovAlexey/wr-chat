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

function createToken(userId) {
  return createSignedChatSessionToken(
    {
      sub: String(userId),
      displayName: `User ${userId}`,
      avatarUrl: "",
      roles: ["user"],
      exp: Date.now() + getChatSessionTtlMs(),
    },
    TEST_ENV,
  );
}

test("channel join and leave update in-memory room membership", async () => {
  const previousSecret = process.env.WR_CHAT_SHARED_SECRET;
  process.env.WR_CHAT_SHARED_SECRET = TEST_ENV.WR_CHAT_SHARED_SECRET;

  const { server, runtime } = createAppServer();

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const sessionToken = createToken(1);

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/ws?sessionToken=${encodeURIComponent(sessionToken)}`,
      );

      let ready = false;

      ws.on("message", (message) => {
        const payload = JSON.parse(String(message || ""));

        try {
          if (payload.type === "session:ready" && !ready) {
            ready = true;
            ws.send(JSON.stringify({ type: "channel:join", channelId: "general" }));
            return;
          }

          if (payload.type === "channel:join:ack") {
            assert.equal(payload.channelId, "general");
            assert.equal(payload.membersCount, 1);
            assert.equal(runtime.rooms.get("general")?.size, 1);
            ws.send(JSON.stringify({ type: "channel:leave", channelId: "general" }));
            return;
          }

          if (payload.type === "channel:leave:ack") {
            assert.equal(payload.channelId, "general");
            assert.equal(payload.membersCount, 0);
            assert.equal(runtime.rooms.has("general"), false);
            ws.close();
            resolve();
          }
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
