import http from "node:http";
import { readConfig } from "./lib/config.mjs";

const config = readConfig(process.env);

function setJsonHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, statusCode, payload) {
  setJsonHeaders(res);
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: config.serviceName,
      version: config.version,
      nodeEnv: config.nodeEnv,
      wrApiOrigin: config.wrApiOrigin,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return sendJson(res, 200, {
      service: config.serviceName,
      status: "ready",
      message: "wr-chat phase 1 scaffold is running",
    });
  }

  return sendJson(res, 404, {
    error: "not_found",
  });
}

const server = http.createServer(handleRequest);

server.listen(config.port, config.host, () => {
  console.log("[wr-chat] server started");
});
