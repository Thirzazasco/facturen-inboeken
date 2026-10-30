-- Automatisch inboeken facturen: schema, tabellen, rechten en opslag.
-- Alles staat in schema `facturen` en bucket `facturen`, zodat het later
-- met een schema-export naar een eigen Supabase-project kan.

create schema if not exists facturen;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type facturen.factuur_status as enum (
  'ontvangen',       -- mail en bijlage opgeslagen
  'te_controleren',  -- uitgelezen, wacht op mens
  'goedgekeurd',     -- in de app goedgekeurd, n8n zet hem naar BC
  'in_bc',           -- concept-inkoopfactuur aangemaakt in BC
  'geboekt',         -- in BC geboekt (gezien via nachtsync)
  'afgewezen',       -- door mens afgewezen, met reden
  'geen_factuur'     -- bijlage is geen factuur
);

create type facturen.rol as enum ('crediteuren', 'lezen');
create type facturen.bron_codering as enum ('ai', 'historie', 'mens');

-- ---------------------------------------------------------------------------
-- Gebruikers en rollen
-- ---------------------------------------------------------------------------
create table facturen.gebruikers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text,
  naam        text,
  rol         facturen.rol not null default 'lezen',
  aangemaakt_op timestamptz not null default now()
);

create or replace function facturen.mijn_rol()
returns facturen.rol
language sql stable security definer
set search_path = ''
as $$
  select g.rol from facturen.gebruikers g where g.user_id = (select auth.uid());
$$;

create or replace function facturen.mag_lezen()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from facturen.gebruikers g where g.user_id = (select auth.uid()));
$$;

create or replace function facturen.mag_wijzigen()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from facturen.gebruikers g
    where g.user_id = (select auth.uid()) and g.rol = 'crediteuren'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table facturen.mails (
  id                uuid primary key default gen_random_uuid(),
  graph_message_id  text not null unique,          -- voorkomt dubbel ophalen
  mailbox           text not null,                 -- bv. invoices@zasco.nl
  bc_bedrijf        text,                          -- BC-bedrijf bij deze mailbox
  afzender          text,
  onderwerp         text,
  ontvangen_op      timestamptz,
  aangemaakt_op     timestamptz not null default now()
);

create table facturen.documenten (
  id            uuid primary key default gen_random_uuid(),
  mail_id       uuid references facturen.mails (id) on delete cascade,
  bestandsnaam  text,
  type          text,                              -- pdf, ubl, xml, overig
  storage_pad   text,                              -- jjjj/mm/<document_id>.pdf
  sha256        text unique,                       -- voorkomt dezelfde PDF twee keer
  aangemaakt_op timestamptz not null default now()
);
create index on facturen.documenten (mail_id);

create table facturen.facturen (
  id                   uuid primary key default gen_random_uuid(),
  document_id          uuid references facturen.documenten (id) on delete set null,
  status               facturen.factuur_status not null default 'ontvangen',
  bc_bedrijf           text,
  -- leverancier
  leverancier_naam     text,
  leverancier_btw      text,
  leverancier_kvk      text,
  leverancier_iban     text,
  -- factuur
  factuurnummer        text,
  factuurdatum         date,
  vervaldatum          date,
  valuta               text default 'EUR',
  is_creditnota        boolean not null default false,
  totaal_excl          numeric(14,2),
  totaal_btw           numeric(14,2),
  totaal_incl          numeric(14,2),
  zekerheid            numeric(4,3),               -- 0..1
  uitgelezen_met       text,                       -- ubl / klein model / groot model
  ai_ruw               jsonb,
  -- BC
  bc_crediteur_nr      text,
  bc_document_nr       text,
  bc_fout              text,
  -- beoordeling
  beoordeeld_door      uuid references auth.users (id),
  beoordeeld_op        timestamptz,
  afwijsreden          text,
  aangemaakt_op        timestamptz not null default now(),
  bijgewerkt_op        timestamptz not null default now()
);
create index on facturen.facturen (status);
create index on facturen.facturen (bc_crediteur_nr, factuurnummer);
create index on facturen.facturen (document_id);
create index on facturen.facturen (beoordeeld_door);

create table facturen.factuurregels (
  id                 uuid primary key default gen_random_uuid(),
  factuur_id         uuid not null references facturen.facturen (id) on delete cascade,
  regelnr            int,
  omschrijving       text,
  aantal             numeric(14,4),
  prijs              numeric(14,4),
  bedrag_excl        numeric(14,2),
  btw_pct            numeric(5,2),
  grootboekrekening  text,
  kostenplaats       text,
  bron_codering      facturen.bron_codering,
  aangemaakt_op      timestamptz not null default now()
);
create index on facturen.factuurregels (factuur_id);

create table facturen.controles (
  id          uuid primary key default gen_random_uuid(),
  factuur_id  uuid not null references facturen.facturen (id) on delete cascade,
  naam        text not null,
  ok          boolean not null,
  detail      text,
  aangemaakt_op timestamptz not null default now()
);
create index on facturen.controles (factuur_id);

create table facturen.crediteuren (
  bc_bedrijf           text not null,
  bc_nr                text not null,
  naam                 text,
  btw_nummer           text,
  kvk                  text,
  iban                 text,
  standaard_grootboek  text,
  bijgewerkt_op        timestamptz not null default now(),
  primary key (bc_bedrijf, bc_nr)
);
create index on facturen.crediteuren (btw_nummer);
create index on facturen.crediteuren (kvk);
create index on facturen.crediteuren (iban);

create table facturen.codeerhistorie (
  id                 uuid primary key default gen_random_uuid(),
  bc_bedrijf         text not null,
  bc_crediteur_nr    text not null,
  omschrijving       text,
  grootboekrekening  text,
  kostenplaats       text,
  aantal_keer        int not null default 1,
  laatst_gebruikt    date
);
create index on facturen.codeerhistorie (bc_bedrijf, bc_crediteur_nr);

create table facturen.logboek (
  id          bigint generated always as identity primary key,
  factuur_id  uuid references facturen.facturen (id) on delete cascade,
  tabel       text not null,
  actie       text not null,
  door        uuid,                                 -- null = systeem (n8n)
  tijdstip    timestamptz not null default now(),
  oud         jsonb,
  nieuw       jsonb
);
create index on facturen.logboek (factuur_id);

-- ---------------------------------------------------------------------------
-- Triggers: bijgewerkt_op, beoordeling vastleggen, logboek
-- ---------------------------------------------------------------------------
create or replace function facturen.zet_bijgewerkt_op()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.bijgewerkt_op := now();
  return new;
end $$;

create trigger facturen_bijgewerkt_op
before update on facturen.facturen
for each row execute function facturen.zet_bijgewerkt_op();

-- Een gebruiker mag alleen naar goedgekeurd / afgewezen / geen_factuur /
-- te_controleren zetten; in_bc en geboekt zet alleen n8n (service role).
create or replace function facturen.controleer_statuswijziging()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    if new.status not in ('te_controleren', 'goedgekeurd', 'afgewezen', 'geen_factuur') then
      raise exception 'Status % kan alleen door het systeem worden gezet', new.status;
    end if;
    if new.status in ('goedgekeurd', 'afgewezen', 'geen_factuur') then
      new.beoordeeld_door := auth.uid();
      new.beoordeeld_op := now();
    end if;
    if new.status = 'afgewezen' and coalesce(trim(new.afwijsreden), '') = '' then
      raise exception 'Geef een reden op bij afwijzen';
    end if;
  end if;
  return new;
end $$;

create trigger facturen_statuswijziging
before update on facturen.facturen
for each row execute function facturen.controleer_statuswijziging();

create or replace function facturen.log_wijziging()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_factuur uuid;
begin
  if tg_table_name = 'facturen' then
    v_factuur := case when tg_op = 'DELETE' then null else new.id end;
  else
    v_factuur := case when tg_op = 'DELETE' then old.factuur_id else new.factuur_id end;
  end if;
  insert into facturen.logboek (factuur_id, tabel, actie, door, oud, nieuw)
  values (
    v_factuur, tg_table_name, lower(tg_op), auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger facturen_log
after insert or update or delete on facturen.facturen
for each row execute function facturen.log_wijziging();

create trigger factuurregels_log
after insert or update or delete on facturen.factuurregels
for each row execute function facturen.log_wijziging();

-- ---------------------------------------------------------------------------
-- Rechten en Row Level Security
-- ---------------------------------------------------------------------------
grant usage on schema facturen to authenticated, service_role;
grant all on all tables in schema facturen to service_role;
grant all on all sequences in schema facturen to service_role;
grant execute on all functions in schema facturen to authenticated, service_role;
revoke execute on function facturen.log_wijziging() from public, anon, authenticated;
revoke execute on function facturen.zet_bijgewerkt_op() from public, anon, authenticated;
revoke execute on function facturen.controleer_statuswijziging() from public, anon, authenticated;

grant select on all tables in schema facturen to authenticated;
grant update on facturen.facturen to authenticated;
grant insert, update, delete on facturen.factuurregels to authenticated;

alter table facturen.gebruikers     enable row level security;
alter table facturen.mails          enable row level security;
alter table facturen.documenten     enable row level security;
alter table facturen.facturen       enable row level security;
alter table facturen.factuurregels  enable row level security;
alter table facturen.controles      enable row level security;
alter table facturen.crediteuren    enable row level security;
alter table facturen.codeerhistorie enable row level security;
alter table facturen.logboek        enable row level security;

-- gebruikers: iedereen ziet zijn eigen rij; rolbeheer via dashboard/service role
create policy "eigen rij lezen" on facturen.gebruikers
  for select to authenticated using (user_id = (select auth.uid()) or facturen.mag_lezen());

create policy "lezen" on facturen.mails          for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.documenten     for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.facturen       for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.factuurregels  for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.controles      for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.crediteuren    for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.codeerhistorie for select to authenticated using (facturen.mag_lezen());
create policy "lezen" on facturen.logboek        for select to authenticated using (facturen.mag_lezen());

create policy "wijzigen" on facturen.facturen
  for update to authenticated
  using (facturen.mag_wijzigen() and status in ('te_controleren', 'afgewezen', 'geen_factuur'))
  with check (facturen.mag_wijzigen());

create policy "toevoegen" on facturen.factuurregels
  for insert to authenticated with check (
    facturen.mag_wijzigen() and exists (
      select 1 from facturen.facturen f where f.id = factuur_id and f.status = 'te_controleren'));
create policy "wijzigen" on facturen.factuurregels
  for update to authenticated using (
    facturen.mag_wijzigen() and exists (
      select 1 from facturen.facturen f where f.id = factuur_id and f.status = 'te_controleren'));
create policy "verwijderen" on facturen.factuurregels
  for delete to authenticated using (
    facturen.mag_wijzigen() and exists (
      select 1 from facturen.facturen f where f.id = factuur_id and f.status = 'te_controleren'));

-- ---------------------------------------------------------------------------
-- Opslag: privé bucket `facturen`
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturen', 'facturen', false, 20971520,
        array['application/pdf', 'application/xml', 'text/xml', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "facturen bucket lezen" on storage.objects
  for select to authenticated
  using (bucket_id = 'facturen' and facturen.mag_lezen());
