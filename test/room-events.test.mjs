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

function createToken(userId, displayName) {
  return createSignedChatSessionToken(
    {
      sub: String(userId),
      displayName,
      avatarUrl: "",
      roles: ["user"],
      exp: Date.now() + getChatSessionTtlMs(),
    },
    TEST_ENV,
  );
}

test("room events broadcast message, typing and presence updates", async () => {
  const previousSecret = process.env.WR_CHAT_SHARED_SECRET;
  const previousApiOrigin = process.env.WR_API_ORIGIN;
  const previousFetch = global.fetch;
  process.env.WR_CHAT_SHARED_SECRET = TEST_ENV.WR_CHAT_SHARED_SECRET;
  process.env.WR_API_ORIGIN = "http://wr-api.local";
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          id: 55,
          channelId: 0,
          authorUserId: 1,
          body: "hello room",
          createdAt: "2026-04-11T12:00:00.000Z",
          editedAt: null,
          deletedAt: null,
        },
      };
    },
  });

  const { server } = createAppServer();

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    await new Promise((resolve, reject) => {
      const received = {
        ws1PresenceTwo: false,
        ws2Typing: false,
        ws2Message: false,
      };

      const ws1 = new WebSocket(
        `ws://127.0.0.1:${port}/ws?sessionToken=${encodeURIComponent(createToken(1, "One"))}`,
      );
      const ws2 = new WebSocket(
        `ws://127.0.0.1:${port}/ws?sessionToken=${encodeURIComponent(createToken(2, "Two"))}`,
      );

      let ws1Ready = false;
      let ws2Ready = false;
      let ws1Joined = false;
      let ws2Joined = false;
      let finished = false;

      function maybeStartActions() {
        if (ws1Joined && ws2Joined && !finished) {
          ws1.send(JSON.stringify({ type: "typing:start", channelId: "general" }));
          ws1.send(
            JSON.stringify({
              type: "message:new",
              channelId: "general",
              body: "hello room",
            }),
          );
        }
      }

      function maybeFinish() {
        if (
          received.ws1PresenceTwo &&
          received.ws2Typing &&
          received.ws2Message &&
          !finished
        ) {
          finished = true;
          ws1.close();
          ws2.close();
          resolve();
        }
      }

      ws1.on("message", (message) => {
        const payload = JSON.parse(String(message || ""));

        try {
          if (payload.type === "session:ready" && !ws1Ready) {
            ws1Ready = true;
            ws1.send(JSON.stringify({ type: "channel:join", channelId: "general" }));
            return;
          }

          if (payload.type === "channel:join:ack" && !ws1Joined) {
            ws1Joined = true;
            maybeStartActions();
            return;
          }

          if (
            payload.type === "presence:update" &&
            payload.channelId === "general" &&
            payload.membersCount === 2
          ) {
            received.ws1PresenceTwo = true;
            maybeFinish();
          }
        } catch (error) {
          reject(error);
        }
      });

      ws2.on("message", (message) => {
        const payload = JSON.parse(String(message || ""));

        try {
          if (payload.type === "session:ready" && !ws2Ready) {
            ws2Ready = true;
            ws2.send(JSON.stringify({ type: "channel:join", channelId: "general" }));
            return;
          }

          if (payload.type === "channel:join:ack" && !ws2Joined) {
            ws2Joined = true;
            maybeStartActions();
            return;
          }

          if (payload.type === "typing:start" && payload.channelId === "general") {
            assert.equal(payload.user.id, "1");
            received.ws2Typing = true;
            maybeFinish();
            return;
          }

          if (payload.type === "message:new" && payload.channelId === "general") {
            assert.equal(payload.message.author.id, "1");
            assert.equal(payload.message.body, "hello room");
            assert.equal(payload.message.id, 55);
            received.ws2Message = true;
            maybeFinish();
          }
        } catch (error) {
          reject(error);
        }
      });

      ws1.on("error", reject);
      ws2.on("error", reject);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));

    if (previousSecret == null) {
      delete process.env.WR_CHAT_SHARED_SECRET;
    } else {
      process.env.WR_CHAT_SHARED_SECRET = previousSecret;
    }

    if (previousApiOrigin == null) {
      delete process.env.WR_API_ORIGIN;
    } else {
      process.env.WR_API_ORIGIN = previousApiOrigin;
    }

    global.fetch = previousFetch;
  }
});
