import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const CHAT_EXCHANGE_TTL_MS = 1000 * 60 * 2;
const CHAT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function normalizeChatSharedSecret(env = process.env) {
  return String(env.WR_CHAT_SHARED_SECRET || "").trim();
}

function signEncodedValue(encoded, secret) {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createSignedLocalSession(payload, env = process.env) {
  const secret = normalizeChatSharedSecret(env);
  if (!secret) {
    throw new Error("missing_wr_chat_shared_secret");
  }

  const encoded = Buffer.from(
    JSON.stringify({
      ...payload,
      ts: Date.now(),
      nonce: payload?.nonce || randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");

  return {
    payload: encoded,
    signature: signEncodedValue(encoded, secret),
  };
}

function createSignedEnvelope(payload, secret) {
  const encoded = Buffer.from(
    JSON.stringify({
      ...payload,
      ts: Date.now(),
      nonce: payload?.nonce || randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");

  return {
    payload: encoded,
    signature: signEncodedValue(encoded, secret),
  };
}

export function verifySignedChatExchangeEnvelope(payload, signature, env = process.env) {
  const secret = normalizeChatSharedSecret(env);
  if (!secret || !payload || !signature) {
    return null;
  }

  const expected = Buffer.from(signEncodedValue(String(payload), secret), "base64url");
  const actual = Buffer.from(String(signature), "base64url");

  if (!actual.length || actual.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(String(payload), "base64url").toString("utf8"));

    if (
      decoded.iss !== "wr-api" ||
      decoded.aud !== "wr-chat" ||
      !String(decoded.sub || "").trim()
    ) {
      return null;
    }

    if (typeof decoded.ts !== "number" || Math.abs(Date.now() - decoded.ts) > CHAT_EXCHANGE_TTL_MS) {
      return null;
    }

    if (typeof decoded.exp !== "number" || decoded.exp <= Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function buildChatSessionView(decoded) {
  return {
    user: {
      id: String(decoded.sub),
      displayName: String(decoded.displayName || ""),
      avatarUrl: String(decoded.avatarUrl || ""),
      roles: Array.isArray(decoded.roles) && decoded.roles.length ? decoded.roles : ["user"],
    },
    issuedBy: "wr-api",
    audience: "wr-chat",
    expiresAt: new Date(decoded.exp).toISOString(),
  };
}

export function getChatExchangeTtlMs() {
  return CHAT_EXCHANGE_TTL_MS;
}

export function createSignedChatSessionToken(decoded, env = process.env) {
  const secret = normalizeChatSharedSecret(env);
  if (!secret) {
    throw new Error("missing_wr_chat_shared_secret");
  }

  const envelope = createSignedEnvelope(
    {
      iss: "wr-chat",
      aud: "wr-chat-ws",
      sub: String(decoded.sub),
      displayName: String(decoded.displayName || ""),
      avatarUrl: String(decoded.avatarUrl || ""),
      roles: Array.isArray(decoded.roles) && decoded.roles.length ? decoded.roles : ["user"],
      exp: Date.now() + CHAT_SESSION_TTL_MS,
    },
    secret,
  );

  return `${envelope.payload}.${envelope.signature}`;
}

export function verifyChatSessionToken(token, env = process.env) {
  const secret = normalizeChatSharedSecret(env);
  if (!secret || !token) {
    return null;
  }

  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(signEncodedValue(payload, secret), "base64url");
  const actual = Buffer.from(signature, "base64url");

  if (!actual.length || actual.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (
      decoded.iss !== "wr-chat" ||
      decoded.aud !== "wr-chat-ws" ||
      !String(decoded.sub || "").trim()
    ) {
      return null;
    }

    if (typeof decoded.exp !== "number" || decoded.exp <= Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function getChatSessionTtlMs() {
  return CHAT_SESSION_TTL_MS;
}
