# Deze fork: pro-features lokaal, tracking self-hosted

Fork van [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) (GPL-3.0, versie 1.26.0,
commit `218eff0` van de upstream-checkout bij het forken). Branch: `fork/unlocked`.

Doel: de features die upstream achter een betaald Mailspring-account zitten, lokaal aanzetten
zonder de servers van de leverancier. Wat client-only is werkt daarna direct; wat een backend nodig
had, is hier vervangen door `tracking-server/` of bewust uitgeschakeld.

## Wat is er aangepast

| Bestand | Wijziging | Waarom |
|---|---|---|
| `app/internal_packages/open-tracking/package.json` | `isIdentityRequired` weg, `serverUrl` → eigen service | package laadde niet zonder Mailspring-ID; pixel ging naar `link.getmailspring.com` |
| `app/internal_packages/link-tracking/package.json` | idem | link-redirect gaat nu naar eigen service |
| `app/internal_packages/thread-snooze/package.json` | `isIdentityRequired` weg | snooze is puur lokaal (queue't bestaande tasks) |
| `app/internal_packages/send-reminders/package.json` | `isIdentityRequired` weg | idem |
| `app/internal_packages/activity/package.json` | `isIdentityRequired` weg | idem |
| `app/src/flux/stores/identity-store.ts` | `hasProFeatures()` → `true` | er is geen billing-server in deze build |
| `app/src/browser/autoupdate-manager.ts` | `AUTO_UPDATE_DISABLED = true` | anders vervangt de vendor-updater je fork door het officiële binary |
| `app/internal_packages/tracking-sync/` (nieuw) | poller: haalt tellingen op en schrijft ze via `SyncbackMetadataTask` in de metadata | de *writer* van `open_count`/`click_count` zat op hun server, niet in de repo |
| `tracking-server/` (nieuw) | pixel, link-redirect, `/api/tracked`, Dockerfile | vervangt `link.getmailspring.com` |

Niet aangeraakt (bewust): `mailspring-exports`, `Mailspring-Sync`, het `mailspring://`-protocol en
interne package-namen. Die zijn dragend; een "volledige" rename sloopt de build zonder dat je er
iets voor terugkrijgt.

## Wat werkt, en wat niet

**Werkt zonder verdere backend:** send later, snooze, send reminders, activity (alleen lokale tasks),
undo send, alle mail-functionaliteit.

**Werkt met `tracking-server/`:** open tracking (pixel + teller), link tracking (redirect + teller),
inclusief de popovers ("Opened by" / "Clicked by") die `open_data`/`click_data` lezen.

**Bewust nog uit** (pakketten houden `isIdentityRequired`, dus ze laden niet): `translation`,
`participant-profile` (contactverrijking), `thread-sharing`. Die kunnen niet zonder server-side
component — vertaling proxyt naar een externe API, verrijking naar een dataleverancier, sharing host
een publieke pagina. Wil je die, dan moet je er zelf een implementatie achter zetten.

## Draaien

```bash
# Node 22 is nodig: node-llama-cpp (dependency van 1.26) gebruikt JSON-import-attributes
npm install
cd app && npm install && cd ..        # app/ heeft eigen dependencies (electron-target)

node tracking-server/server.cjs &     # of: docker compose up in tracking-server/
npm start                             # electron ./app --dev
```

De mailsync-binary wordt door `scripts/postinstall.js` van `mailspring-builds.s3.amazonaws.com`
gehaald op basis van de submodule-commit. Heb je met `--depth 1` gekloond zonder submodules, dan
faalt die stap; haal de submodule op (`git submodule update --init mailsync`) of bouw `mailsync/`
zelf.

## Hernoemen (voor je binaries verspreidt)

De GPL geeft je de code, niet de merknaam. Praktisch zijn dit de plekken die tellen:

1. `app/package.json` → `name`, `productName`, `description` (bepaalt de app-naam, de datadir en de
   installer-metadata; `app/build/build.js:483,517` leest `productName`).
2. `app/build/resources/{win,mac,linux}/` → iconen en installer-assets.
3. Menuteksten/About: `app/src/browser/application.ts` (o.a. de foutmeldingen die "Mailspring"
   noemen) en `app/lang/*.json` voor de strings.
4. `mailspring://`-protocol (`app/src/browser/mailspring-protocol-handler.ts`) — alleen aanpassen als
   je ook de deep-links en de taskbar-shortcuts meeneemt; anders laat je hem staan.
5. `README.md`/`LICENSE.md`: behoud de GPL-3.0-tekst en de copyright-regel van upstream, en zet
   erboven wat jij hebt gewijzigd (GPL §5a).

## Licentie

Deze fork valt onder GPL-3.0 (zie `LICENSE.md`). Verspreid je binaries, dan moet de volledige bron
mee — inclusief `tracking-server/`. Geen enkele regel van deze fork is bedoeld om de upstream-
servers te omzeilen: die zijn niet geforkt, ze zijn vervangen.
