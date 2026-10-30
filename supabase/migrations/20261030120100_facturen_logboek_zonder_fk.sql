-- Logboek moet blijven bestaan, ook als een factuur wordt verwijderd.
alter table facturen.logboek drop constraint if exists logboek_factuur_id_fkey;
