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

## Environment

- `PORT`
- `HOST`
- `WR_CHAT_PUBLIC_ORIGIN`
- `WR_API_ORIGIN`
- `WR_CHAT_SHARED_SECRET`
- `WR_CHAT_ALLOWED_ORIGINS`
