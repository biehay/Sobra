-- Resumen semanal por email (lo nuevo para cada usuario). Se puede desactivar
-- desde Mis datos o con el link de baja del propio email.
alter table public.perfiles add column recibe_resumen boolean not null default true;
