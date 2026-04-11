import http from "node:http";

const port = Number(process.env.PORT || 3400);
const host = process.env.HOST || "127.0.0.1";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "wr-chat",
        version: "0.1.0",
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(port, host, () => {
  console.log(`wr-chat listening on http://${host}:${port}`);
});
