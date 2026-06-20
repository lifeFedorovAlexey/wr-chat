# wr-chat

Dedicated realtime service that will run on a separate host from the main site.

## Phase 1 scope

- independent deployment contour
- minimal HTTP service
- `/health` endpoint
- env contract for future `wr-api` auth handoff

## Planned responsibility

- websocket realtime for text chat
- presence and typing
- room membership state
- later on the same host: audio-room signalling

## Local run

```bash
npm ci
npm run start
```

## CI / Deploy

- Pull requests that touch `wr-chat/**` run the wr-chat CI checks.
- Pushes to `main` that touch `wr-chat/**` deploy wr-chat automatically.
- The deploy workflow starts a PM2 canary, replaces the live `wr-chat` process, installs the `/wr-chat/` nginx proxy block if needed, reloads nginx, and checks `https://wildriftallstats.ru/wr-chat/health`.
- Manual deploy is still available through the `wr-chat Pipeline` workflow with `deploy=true`.

## Environment

- `PORT`
- `HOST`
- `WR_CHAT_PUBLIC_ORIGIN` - public origin for browser/UI access, for example `https://wildriftallstats.ru/wr-chat`
- `WR_API_ORIGIN` - public API gateway used by chat to persist messages, for example `https://wildriftallstats.ru/wr-api`
- `WR_CHAT_SHARED_SECRET` - shared secret with `wr-api`; must be exactly the same value in both repos
- `WR_CHAT_ALLOWED_ORIGINS` - comma-separated browser origins allowed to open websockets, for example `https://wildriftallstats.ru`

## GitHub Secrets

For the current same-server deployment, configure these secrets in the `wr-chat` repo:

- `TIMEWEB_CHAT_HOST`
- `TIMEWEB_CHAT_USER`
- `TIMEWEB_CHAT_PASSWORD`
- `WR_CHAT_PUBLIC_ORIGIN`
- `WR_API_ORIGIN`
- `WR_CHAT_SHARED_SECRET`
- `WR_CHAT_ALLOWED_ORIGINS`

## Reverse Proxy

For same-server deployment behind `https://wildriftallstats.ru/wr-chat`, nginx must strip the `/wr-chat/` prefix and preserve websocket upgrade headers:

```nginx
location /wr-chat/ {
  proxy_pass http://127.0.0.1:3010/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}
```

Expected public checks after deploy:

```bash
curl -fsS https://wildriftallstats.ru/wr-chat/health
```
