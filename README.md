# Facturen – review-app

Eigen alternatief voor Blue10: inkoopfacturen uit de mail worden door n8n uitgelezen en in Supabase gezet. In deze app keurt een mens ze goed, waarna n8n een concept-inkoopfactuur in Business Central aanmaakt.

- **Frontend:** React + TypeScript (Vite), `@supabase/supabase-js`, React Router
- **Backend:** Supabase-project `zasco-debiteurenbeheer` (`iqqunetlifkavjynvphp`), schema `facturen`, privé bucket `facturen`
- **Verwerking:** n8n (mail ophalen, uitlezen, verrijken, naar BC, BC-sync)

## Lokaal draaien

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Schermen

| Scherm | Pad | Wat |
| --- | --- | --- |
| Inbox | `/` | Facturen per status, rood/groen voor de controles, zoeken op leverancier/factuurnummer |
| Beoordelen | `/factuur/:id` | PDF links, velden en regels rechts. Goedkeuren, afwijzen (met reden), geen factuur |
| Overzicht | `/overzicht` | Aantallen per status, doorlooptijd, % AI-uitlezing ongewijzigd goedgekeurd |

## Database

Migraties staan in `supabase/migrations/`. Tabellen in schema `facturen`:
`mails`, `documenten`, `facturen`, `factuurregels`, `controles`, `crediteuren`, `codeerhistorie`, `logboek`, `gebruikers`.

Statussen: `ontvangen → te_controleren → goedgekeurd → in_bc → geboekt`, zijtak `afgewezen` / `geen_factuur`.

**Rechten**

- Row Level Security staat aan op alle tabellen.
- Gebruikers krijgen pas toegang na een rij in `facturen.gebruikers` met rol `crediteuren` (beoordelen) of `lezen`.
- Een gebruiker kan de status alleen op `te_controleren`, `goedgekeurd`, `afgewezen` of `geen_factuur` zetten. `in_bc` en `geboekt` zet alleen n8n (service role).
- Elke wijziging aan `facturen` en `factuurregels` komt via een trigger in `facturen.logboek`.
- n8n schrijft met de **service role key**. Die komt nooit in deze app.

## Eenmalige instellingen in het Supabase-dashboard

1. **Schema openzetten voor de API:** Project Settings → API → *Exposed schemas* → `facturen` toevoegen.
2. **Inloggen met Microsoft:** Authentication → Providers → *Azure* aanzetten (client-id/secret van een Entra-app, redirect `https://iqqunetlifkavjynvphp.supabase.co/auth/v1/callback`).
3. **Redirect-URL's:** Authentication → URL Configuration → de URL van de app (en `http://localhost:5173`) toevoegen.
4. **Gebruiker toevoegen** (na de eerste keer inloggen):

```sql
insert into facturen.gebruikers (user_id, email, naam, rol)
select id, email, 'Thirza', 'crediteuren' from auth.users where email = 'thirza@zasco.nl';
```

## Hosting

Elke statische host werkt (Vercel, Netlify, Cloudflare Pages). Build: `npm run build`, output: `dist`. Zet `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY` als omgevingsvariabelen. `vercel.json` en `public/_redirects` zorgen dat diepe links (`/factuur/...`) werken.
