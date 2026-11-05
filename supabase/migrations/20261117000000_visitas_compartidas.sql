-- Visitas que llegan desde un link compartido (botón "Compartir" → WhatsApp, etc.),
-- para saber cuánto mueve el boca a boca. Se guarda igual que el resto de las
-- visitas: sin datos de la persona, solo si esa visita vino por un link compartido.
alter table public.visitas_lote add column if not exists compartido boolean not null default false;

-- El admin ve las visitas de todos los lotes (para las métricas del panel).
create policy "el admin ve las visitas" on public.visitas_lote for select to authenticated using (public.es_admin());
