import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatSessionView,
  createSignedChatSessionToken,
  createSignedLocalSession,
  getChatExchangeTtlMs,
  getChatSessionTtlMs,
  verifyChatSessionToken,
  verifySignedChatExchangeEnvelope,
} from "../lib/chatAuth.mjs";

const TEST_ENV = {
  WR_CHAT_SHARED_SECRET: "local-chat-secret",
};

test("verifySignedChatExchangeEnvelope accepts valid wr-api handoff", () => {
  const envelope = createSignedLocalSession(
    {
      iss: "wr-api",
      aud: "wr-chat",
      sub: "42",
      displayName: "Life",
      avatarUrl: "https://example.com/avatar.png",
      roles: ["user", "streamer"],
      exp: Date.now() + getChatExchangeTtlMs(),
    },
    TEST_ENV,
  );

  const decoded = verifySignedChatExchangeEnvelope(
    envelope.payload,
    envelope.signature,
    TEST_ENV,
  );

  assert.equal(decoded?.sub, "42");
  assert.equal(decoded?.iss, "wr-api");
  assert.deepEqual(decoded?.roles, ["user", "streamer"]);
});

test("verifySignedChatExchangeEnvelope rejects wrong audience", () => {
  const envelope = createSignedLocalSession(
    {
      iss: "wr-api",
      aud: "not-chat",
      sub: "42",
      exp: Date.now() + getChatExchangeTtlMs(),
    },
    TEST_ENV,
  );

  const decoded = verifySignedChatExchangeEnvelope(
    envelope.payload,
    envelope.signature,
    TEST_ENV,
  );

  assert.equal(decoded, null);
});

test("buildChatSessionView normalizes public session shape", () => {
  const session = buildChatSessionView({
    sub: "77",
    displayName: "User",
    avatarUrl: "",
    roles: [],
    exp: Date.now() + 10_000,
  });

  assert.equal(session.user.id, "77");
  assert.deepEqual(session.user.roles, ["user"]);
  assert.equal(session.issuedBy, "wr-api");
});

test("verifyChatSessionToken accepts wr-chat issued session", () => {
  const token = createSignedChatSessionToken(
    {
      sub: "77",
      displayName: "User",
      avatarUrl: "",
      roles: ["user"],
      exp: Date.now() + getChatSessionTtlMs(),
    },
    TEST_ENV,
  );

  const decoded = verifyChatSessionToken(token, TEST_ENV);

  assert.equal(decoded?.sub, "77");
  assert.equal(decoded?.aud, "wr-chat-ws");
});
