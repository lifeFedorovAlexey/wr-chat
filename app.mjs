import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import {
  buildChatSessionView,
  createSignedChatSessionToken,
  verifyChatSessionToken,
  verifySignedChatExchangeEnvelope,
} from "./lib/chatAuth.mjs";
import { persistChatMessage } from "./lib/wrApiClient.mjs";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function createWsRuntime() {
  const clients = new Map();
  const rooms = new Map();

  function joinRoom(clientId, channelId) {
    const normalizedChannelId = String(channelId || "").trim();
    if (!normalizedChannelId) {
      return null;
    }

    const client = clients.get(clientId);
    if (!client) {
      return null;
    }

    let room = rooms.get(normalizedChannelId);
    if (!room) {
      room = new Set();
      rooms.set(normalizedChannelId, room);
    }

    room.add(clientId);
    client.channels.add(normalizedChannelId);

    return {
      channelId: normalizedChannelId,
      membersCount: room.size,
    };
  }

  function leaveRoom(clientId, channelId) {
    const normalizedChannelId = String(channelId || "").trim();
    if (!normalizedChannelId) {
      return null;
    }

    const client = clients.get(clientId);
    if (!client) {
      return null;
    }

    const room = rooms.get(normalizedChannelId);
    if (!room) {
      client.channels.delete(normalizedChannelId);
      return {
        channelId: normalizedChannelId,
        membersCount: 0,
      };
    }

    room.delete(clientId);
    client.channels.delete(normalizedChannelId);

    if (room.size === 0) {
      rooms.delete(normalizedChannelId);
    }

    return {
      channelId: normalizedChannelId,
      membersCount: room.size,
    };
  }

  function leaveAllRooms(clientId) {
    const client = clients.get(clientId);
    if (!client) {
      return;
    }

    for (const channelId of Array.from(client.channels)) {
      leaveRoom(clientId, channelId);
    }
  }

  return {
    clients,
    rooms,
    getClient(clientId) {
      return clients.get(clientId) || null;
    },
    register(ws, session) {
      const clientId = randomUUID();
      clients.set(clientId, { ws, session, channels: new Set() });
      return clientId;
    },
    joinRoom,
    leaveRoom,
    unregister(clientId) {
      leaveAllRooms(clientId);
      clients.delete(clientId);
    },
  };
}

function buildRoomPresence(runtime, channelId) {
  const room = runtime.rooms.get(channelId);
  const members = room
    ? Array.from(room)
        .map((memberClientId) => {
          const client = runtime.getClient(memberClientId);
          if (!client) {
            return null;
          }

          return {
            clientId: memberClientId,
            user: client.session.user,
          };
        })
        .filter(Boolean)
    : [];

  return {
    type: "presence:update",
    channelId,
    membersCount: members.length,
    members,
  };
}

function broadcastToRoom(runtime, channelId, payload, options = {}) {
  const room = runtime.rooms.get(channelId);
  if (!room) {
    return 0;
  }

  let delivered = 0;
  const excludedClientId = String(options.excludeClientId || "").trim();

  for (const memberClientId of room) {
    if (excludedClientId && memberClientId === excludedClientId) {
      continue;
    }

    const client = runtime.getClient(memberClientId);
    if (!client) {
      continue;
    }

    client.ws.send(JSON.stringify(payload));
    delivered += 1;
  }

  return delivered;
}

function sendPresenceUpdate(runtime, channelId) {
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedChannelId) {
    return;
  }

  const payload = buildRoomPresence(runtime, normalizedChannelId);
  broadcastToRoom(runtime, normalizedChannelId, payload);
}

async function handleSocketMessage(ws, runtime, clientId, rawMessage) {
  try {
    const message = JSON.parse(String(rawMessage || ""));
    const type = String(message?.type || "").trim();

    if (type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if ((type === "channel:join" || type === "channel:leave") && message.channelId) {
      const result =
        type === "channel:join"
          ? runtime.joinRoom(clientId, message.channelId)
          : runtime.leaveRoom(clientId, message.channelId);

      if (!result) {
        ws.send(JSON.stringify({ type: "error", error: "room_registry_failed" }));
        return;
      }

      ws.send(
        JSON.stringify({
          type: `${type}:ack`,
          channelId: result.channelId,
          membersCount: result.membersCount,
        }),
      );

      sendPresenceUpdate(runtime, result.channelId);
      return;
    }

    if (type === "message:new" && message.channelId) {
      const channelId = String(message.channelId).trim();
      const client = runtime.getClient(clientId);

      if (!client || !client.channels.has(channelId)) {
        ws.send(JSON.stringify({ type: "error", error: "channel_not_joined" }));
        return;
      }

      const body = String(message.body || "").trim();
      if (!body) {
        ws.send(JSON.stringify({ type: "error", error: "message_body_required" }));
        return;
      }

      const persistedMessage = await persistChatMessage(
        {
          userId: Number(client.session.user.id),
          channelId: Number(channelId),
          body,
        },
        process.env,
      );

      const event = {
        type: "message:new",
        channelId,
        message: {
          ...(persistedMessage || {}),
          author: client.session.user,
        },
      };

      broadcastToRoom(runtime, channelId, event);
      return;
    }

    if ((type === "typing:start" || type === "typing:stop") && message.channelId) {
      const channelId = String(message.channelId).trim();
      const client = runtime.getClient(clientId);

      if (!client || !client.channels.has(channelId)) {
        ws.send(JSON.stringify({ type: "error", error: "channel_not_joined" }));
        return;
      }

      broadcastToRoom(
        runtime,
        channelId,
        {
          type,
          channelId,
          user: client.session.user,
        },
        { excludeClientId: clientId },
      );
      return;
    }

    ws.send(JSON.stringify({ type: "error", error: "unsupported_event" }));
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "invalid_message",
      }),
    );
  }
}

export function createAppServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "wr-chat",
        version: "0.1.0",
      });
      return;
    }

    if (req.method === "POST" && req.url === "/session/exchange") {
      try {
        const body = await readJsonBody(req);
        const decoded = verifySignedChatExchangeEnvelope(
          String(body?.payload || ""),
          String(body?.signature || ""),
          process.env,
        );

        if (!decoded) {
          sendJson(res, 401, { error: "invalid_chat_exchange" });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          expiresInMs: Math.max(0, Number(decoded.exp) - Date.now()),
          session: buildChatSessionView(decoded),
          sessionToken: createSignedChatSessionToken(decoded, process.env),
        });
        return;
      } catch {
        sendJson(res, 400, { error: "invalid_request_body" });
        return;
      }
    }

    sendJson(res, 404, { error: "Not Found" });
  });

  const runtime = createWsRuntime();
  const wsServer = new WebSocketServer({ noServer: true });

  wsServer.on("connection", (ws, request, session) => {
    const clientId = runtime.register(ws, session);

    ws.send(
      JSON.stringify({
        type: "session:ready",
        clientId,
        user: session.user,
      }),
    );

    ws.on("message", (message) => {
      void handleSocketMessage(ws, runtime, clientId, message);
    });

    ws.on("close", () => {
      const client = runtime.getClient(clientId);
      const joinedChannels = client ? Array.from(client.channels) : [];
      runtime.unregister(clientId);

      for (const channelId of joinedChannels) {
        sendPresenceUpdate(runtime, channelId);
      }
    });
  });

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      const sessionToken = String(url.searchParams.get("sessionToken") || "");
      const decoded = verifyChatSessionToken(sessionToken, process.env);

      if (!decoded) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const session = buildChatSessionView(decoded);
      wsServer.handleUpgrade(request, socket, head, (ws) => {
        wsServer.emit("connection", ws, request, session);
      });
    } catch {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  return { server, wsServer, runtime };
}

export function startServer({
  port = Number(process.env.PORT || 3400),
  host = process.env.HOST || "127.0.0.1",
} = {}) {
  const { server } = createAppServer();

  server.listen(port, host, () => {
    console.log("[wr-chat] server started");
  });

  return server;
}
