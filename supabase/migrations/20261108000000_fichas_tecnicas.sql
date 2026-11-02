-- Fichas técnicas de los lotes: qué es cada producto, su proceso físico de uso
-- o instalación y qué complementos necesita. Las arma la IA una vez por lote y
-- las usan las recomendaciones. Sirven para cualquier rubro.
create table public.fichas_lote (
  lote_id uuid primary key references public.lotes (id) on delete cascade,
  ficha jsonb not null,
  modelo text not null,
  created_at timestamptz not null default now()
);

alter table public.fichas_lote enable row level security;
-- Se ven si se ve el lote (la ficha sale de lo que el lote ya muestra).
create policy "fichas de lotes visibles" on public.fichas_lote
  for select using (
    exists (
      select 1 from public.lotes l
      where l.id = lote_id
        and (l.estado in ('publicado', 'reservado', 'vendido') or l.vendedor_id = auth.uid() or public.es_admin())
    )
  );
-- Solo las escribe el servidor.
revoke insert, update, delete on public.fichas_lote from anon, authenticated;
