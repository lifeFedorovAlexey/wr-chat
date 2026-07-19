function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

export function getWrApiOrigin(env = process.env) {
  return normalizeOrigin(env.WR_API_ORIGIN);
}

export class WrApiClientError extends Error {
  constructor(code, payload = {}, status = 400) {
    super(String(code || "wr_api_request_failed"));
    this.name = "WrApiClientError";
    this.code = String(code || "wr_api_request_failed");
    this.payload = payload && typeof payload === "object" ? payload : {};
    this.status = Number(status) || 400;
  }
}

async function requestWrApi(pathname, input, env = process.env) {
  const apiOrigin = getWrApiOrigin(env);
  const secret = String(env.WR_CHAT_SHARED_SECRET || "").trim();

  if (!apiOrigin) throw new Error("missing_wr_api_origin");
  if (!secret) throw new Error("missing_wr_chat_shared_secret");

  const response = await fetch(`${apiOrigin}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-wr-chat-secret": secret,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WrApiClientError(
      payload?.error || `wr_api_http_${response.status}`,
      payload || {},
      response.status,
    );
  }
  return payload || {};
}

export async function persistChatMessage(input, env = process.env) {
  const payload = await requestWrApi("/api/internal/chat/messages", input, env);
  return payload?.message || null;
}

export async function authorizeChatChannelAccess(input, env = process.env) {
  return await requestWrApi("/api/internal/chat/channels/access", input, env);
}

export async function deleteChatMessage(input, env = process.env) {
  const payload = await requestWrApi(
    "/api/internal/chat/messages",
    { ...input, action: "delete" },
    env,
  );
  return payload?.deleted || null;
}

export async function moderateChatUser(input, env = process.env) {
  const payload = await requestWrApi("/api/internal/chat/moderation", input, env);
  return payload?.result || null;
}
