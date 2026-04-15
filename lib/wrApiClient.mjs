function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

export function getWrApiOrigin(env = process.env) {
  return normalizeOrigin(env.WR_API_ORIGIN);
}

export async function persistChatMessage(input, env = process.env) {
  const apiOrigin = getWrApiOrigin(env);
  const secret = String(env.WR_CHAT_SHARED_SECRET || "").trim();

  if (!apiOrigin) {
    throw new Error("missing_wr_api_origin");
  }

  if (!secret) {
    throw new Error("missing_wr_chat_shared_secret");
  }

  const response = await fetch(`${apiOrigin}/api/internal/chat/messages`, {
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
    throw new Error(payload?.error || "wr_api_message_persist_failed");
  }

  return payload?.message || null;
}
