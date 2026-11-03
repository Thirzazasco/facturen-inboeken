-- Extra velden die nodig zijn om een factuur net zo compleet te boeken als in Blue10
-- (omschrijving, betalingsconditie/-wijze, pakbonnummer, inkoopordernummer, opmerking).

alter table facturen.facturen
  add column if not exists omschrijving text,
  add column if not exists betalingsconditie text,
  add column if not exists betalingswijze text,
  add column if not exists pakbonnummer text,
  add column if not exists inkoopordernummer text,
  add column if not exists opmerking text;
