# Facturen – review-app voor automatisch inboeken

Eigen alternatief voor Blue10: inkoopfacturen uit de mail halen → uitlezen → controleren → als **concept**-inkoopfactuur in Business Central zetten. Draait voorlopig **parallel aan Blue10** als test.

Deze repo bevat de **review-app** (React + TypeScript, Vite). De verwerking (mail ophalen, uitlezen, boeken) gebeurt in **n8n**; de data staat in **Supabase**.

Volledig plan (architectuur, datamodel, fasering): https://claude.ai/artifact/D3fwvr8tcXivuPBYu7Jxbg

## Harde regels

- **Nooit definitief boeken.** Alleen concept-inkoopfacturen via BC API v2.0. Een mens keurt altijd eerst goed in deze app.
- **Mailboxen alleen-lezen.** Niets verplaatsen, verwijderen of als gelezen markeren (Blue10 werkt er nog mee). Verwerkte mails worden bijgehouden op Graph message-id.
- **Alles in schema `facturen`**, niet in `public`. Zo kan het later makkelijk naar een eigen Supabase-project.
- **Controles in code, niet via een LLM**: totalen, IBAN, btw-nummer, verplichte velden, crediteur-matching en dubbele facturen.
- Geen secrets in de repo. Gebruik `.env.local` (staat in `.gitignore`); in de frontend alleen de publishable/anon key, **nooit** de service role key.
- Schemawijzigingen altijd als migratie, met RLS aan op elke nieuwe tabel.

## Omgeving

| Onderdeel | Waarde |
|---|---|
| Mailboxen | invoices@zasco.nl, invoices@dutchagro.nl, invoices@agropa.nl (Microsoft 365, zelfde tenant) |
| BC-bedrijven | waarschijnlijk 3, één per mailbox (kolom `bc_bedrijf`) |
| Supabase-project | `zasco-debiteurenbeheer` (ref `iqqunetlifkavjynvphp`) |
| Schema / bucket | `facturen` / privé bucket `facturen` (max 20 MB; pdf, xml, png, jpg) |
| n8n-credential BC | "BC oAuth2 - n8n v2" |
| n8n-credential mail | "Microsoft Outlook account" (gedelegeerd, ingelogd als thirza@zasco.nl; leestoegang tot alle 3 mailboxen getest op 30-10) |
| n8n-testworkflows | "Facturen – TEST uitlezen (upload)" (id `uU4YrwUImo5yhnEC`), "Facturen – TEST mailtoegang (alleen lezen)" (id `zBIkKtiiRSyXOGvp`) |
| n8n-productieworkflow | "Facturen – Mail ophalen en uitlezen" (id `H6nb99WnshPneSvj`): haalt mail op uit de 3 invoices-postbussen (laatste 14 dagen, handmatige trigger, nu beperkt tot 10 per run voor tests), zet PDF in storage, laat 'm uitlezen en schrijft weg als `te_controleren`. Dedupliceert op het bestaan van een `documenten`-rij (niet alleen `mails`), zodat een mail die halverwege vastloopt opnieuw geprobeerd wordt. |
| n8n-credential uitlezen | Eigen OpenAI-credential ("OpenAI account") met GPT-4o, resource `document`/`file`. Niet de gedeelde n8n "gateway credits": die ondersteunen geen bestand-uitlezen. |

## Datamodel (schema `facturen`)

Tabellen: `mails`, `documenten`, `facturen`, `factuurregels`, `controles`, `crediteuren` (PK `bc_bedrijf` + `bc_nr`), `codeerhistorie`, `logboek`, `gebruikers`.

`facturen` heeft naast de basisvelden ook boekvelden die Blue10 ook vraagt: `omschrijving`, `betalingsconditie`, `betalingswijze`, `pakbonnummer`, `inkoopordernummer`, `opmerking` (vrij tekstveld voor de beoordelaar). De AI vult de eerste vier waar mogelijk; `betalingswijze` en `opmerking` zijn voor nu mens-only.

**Statussen** (enum): `ontvangen` → `te_controleren` → `goedgekeurd` → `in_bc` → `geboekt`, plus `afgewezen` en `geen_factuur`.

- Gebruikers (via de app) mogen alleen naar `te_controleren`, `goedgekeurd`, `afgewezen` en `geen_factuur`. Dat wordt afgedwongen met een trigger.
- `in_bc` en `geboekt` zet alleen n8n (service role).
- Afwijzen vereist een reden.
- Rollen in `facturen.gebruikers`: `crediteuren` (beoordelen) en `lezen`.
- RLS staat op alle tabellen. Het logboek vult zich via triggers op `facturen` en `factuurregels`.

Migraties: `facturen_schema_init`, `facturen_logboek_zonder_fk`, `facturen_boekvelden` (en een lege `facturen_schema` met alleen `select 1`; die kan geen kwaad).

## Uitleesstrategie (n8n, getrapt om kosten laag te houden)

**Huidige (eerste) versie:** elke PDF gaat in zijn geheel naar GPT-4o — simpel en werkt, maar niet de kostenbesparende aanpak hieronder. Dat is nog te bouwen:

1. UBL/XML aanwezig → direct parsen, geen LLM.
2. Digitale PDF → tekst eruit halen → klein model.
3. Controles falen of het is een scan → hele PDF naar een groter model.
4. Grootboekrekening uit de codeerhistorie; alleen bij een nieuwe leverancier een LLM-suggestie.

## De app

Schermen: **Inbox**, **Beoordelen** (PDF naast de velden, regels, controles, waarschuwing bij een afwijkend IBAN) en **Overzicht**.
Inloggen via Microsoft (Supabase Azure-provider, nog niet aangezet), een magic link, of e-mail+wachtwoord (toegevoegd als eerste werkende optie terwijl Azure nog niet staat).

```bash
npm install
npm run dev      # lokaal draaien
npm run lint
npm run build
```

CI (GitHub Actions) draait lint + build. Zorg dat beide slagen voordat je commit.

De Supabase-client moet schema `facturen` gebruiken (`db: { schema: 'facturen' }`). Dat schema moet in het Supabase-dashboard onder *Exposed schemas* staan.

## Nog open

- Supabase-dashboard: Azure-provider aanzetten en redirect-URL's instellen voor Microsoft-login. (`facturen` staat al in *Exposed schemas* en de eerste gebruiker — thirza@zasco.nl, rol `crediteuren` — staat al in `facturen.gebruikers`.)
- Hosting kiezen (Vercel, Netlify of Cloudflare Pages).
- n8n-workflow verder afbouwen: nu handmatige trigger + 10 facturen per run (test); nog te doen: schedule-trigger, alle postbussen zonder limiet, de getrapte uitleesstrategie (zie boven) i.p.v. altijd de hele PDF naar GPT-4o, en de BC-push (concept-inkoopfactuur aanmaken na goedkeuring).
- Rate limiting: Microsoft Graph gaf tijdens testen "MailboxConcurrency"-fouten; de workflow throttelt nu met 2s tussen requests en retries — kan nog fijner.
- Definitieve mailkoppeling: nieuwe Entra-app "n8n – facturen mail" met Mail.Read (Application), beperkt tot de 3 mailboxen via Exchange RBAC for Applications (aangevraagd bij de beheerder op 30-10). Tot die tijd draait het op de bestaande app "n8n outlook" met gedelegeerde rechten.
- Uitzoeken of Blue10 mails uit de inbox verplaatst.
- Los van dit project: in `public` staan 4 backup-tabellen zonder RLS (`cf_backup_*`).

## Werkwijze

- Communicatie en UI-teksten in het Nederlands.
- Kleine, duidelijke commits. Raak je het datamodel aan, werk dan dit bestand ook bij.
