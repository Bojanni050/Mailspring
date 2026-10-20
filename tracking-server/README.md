# tracking-server

Vervangt `link.getmailspring.com` voor deze fork: de tracking-pixel, de link-redirect en de
API waar `tracking-sync` de cijfers ophaalt. Geen dependencies, alleen Node ≥ 18.

```bash
node server.cjs                       # http://127.0.0.1:5199
PORT=8080 BIND=0.0.0.0 API_TOKEN=xxx node server.cjs
```

| Endpoint | Wat het doet |
|---|---|
| `GET /o/<token>.png` | 1×1 pixel; `token` = base64url(JSON `{messageId, accountId, recipient}`), precies wat de composer maakt |
| `GET /link/<messageId>/<i>?redirect=<url>&recipient=<base64>` | telt de klik en stuurt 302 naar het originele doel (alleen http/https) |
| `GET /api/tracked` | wat de client pollt; `?accountId=` filtert, `?token=`/`Authorization: Bearer` vereist zodra `API_TOKEN` gezet is |
| `GET /health` | `{ok, tracked}` |
| `GET /` | minimale HTML-pagina met de tellingen |

Opslag is één JSON-bestand (`DATA_FILE`, standaard `./tracking-data.json`, atomair weggeschreven,
max. 1×/seconde). Dat is genoeg voor eigen gebruik; zet er Postgres achter als je meerdere
gebruikers krijgt.

## Twee dingen die je moet weten

- **Gmail/Outlook proxyen afbeeldingen.** Hun image-proxy haalt de pixel op, dus de eerste "open"
  is vaak een bot. De server telt ze wel maar houdt ze apart: `proxyHits` per ontvanger, op basis
  van de user-agent. Vertrouw op `opens - proxyHits` als ondergrens, niet als exactheid.
- **Publieke URL is verplicht.** De pixel-URL wordt in de *verzonden mail* gezet, dus
  `http://127.0.0.1:5199` werkt alleen voor testen naar jezelf. Zet in
  `app/internal_packages/{open,link}-tracking/package.json` → `serverUrl` je publieke HTTPS-host
  (bv. `https://track.example.com`) en hang deze service achter je reverse proxy.

## Docker

```bash
docker build -t tracking-server .
docker run -d --name tracking -p 127.0.0.1:5199:5199 -v tracking-data:/data tracking-server
```

`/data/tracking-data.json` is je enige state; back-up = dat bestand.
