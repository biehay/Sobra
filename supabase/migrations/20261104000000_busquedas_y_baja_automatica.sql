-- "Lo busco": pedidos de compradores con aviso automático cuando se publica un
-- lote que coincide. Y la baja automática de precio, opcional para cada lote.

-- ---------------------------------------------------------------------------
-- Búsquedas guardadas
-- ---------------------------------------------------------------------------
create table public.busquedas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  texto text not null check (char_length(texto) between 3 and 80),
  categoria text,
  zona text,
  precio_max numeric(14, 2) check (precio_max is null or precio_max > 0),
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
create index busquedas_activas_idx on public.busquedas (activa) where activa;

alter table public.busquedas enable row level security;
create policy "busquedas propias" on public.busquedas
  for select using (usuario_id = auth.uid() or public.es_admin());
create policy "crear busqueda propia" on public.busquedas
  for insert with check (usuario_id = auth.uid());
create policy "editar busqueda propia" on public.busquedas
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "borrar busqueda propia" on public.busquedas
  for delete using (usuario_id = auth.uid() or public.es_admin());

-- Como máximo 10 búsquedas activas por usuario.
create function public.limitar_busquedas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activa and (select count(*) from public.busquedas
                     where usuario_id = new.usuario_id and activa and id <> new.id) >= 10 then
    raise exception 'Podés tener hasta 10 búsquedas activas. Pausá o borrá alguna.';
  end if;
  new.usuario_id := coalesce(old.usuario_id, new.usuario_id);
  new.created_at := coalesce(old.created_at, now());
  return new;
end;
$$;

create trigger limitar_busquedas before insert or update on public.busquedas
  for each row execute function public.limitar_busquedas();
create trigger a_exigir_dos_pasos before insert or update or delete on public.busquedas
  for each row execute function public.exigir_dos_pasos();

-- Texto en minúsculas y sin tildes, para comparar.
create function public.normalizar(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$;

-- Si un lote coincide con una búsqueda: misma categoría y zona (si las eligió),
-- precio dentro del máximo y todas las palabras de la búsqueda (de 3 letras o
-- más, sin el plural) en el título, la descripción o los materiales.
create function public.coincide(p_busqueda public.busquedas, p_lote public.lotes)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_lote.estado = 'publicado'
     and p_busqueda.activa
     and p_busqueda.usuario_id <> p_lote.vendedor_id
     and (p_busqueda.categoria is null or p_busqueda.categoria = p_lote.categoria)
     and (p_busqueda.zona is null or p_busqueda.zona = p_lote.zona)
     and (p_busqueda.precio_max is null or p_busqueda.precio_max >= coalesce(p_lote.precio_publicado, p_lote.precio_pedido))
     and not exists (
       select 1
       from unnest(regexp_split_to_array(public.normalizar(p_busqueda.texto), '[^a-z0-9]+')) as palabra
       where length(palabra) >= 3
         and position(
               case when length(palabra) > 4 then regexp_replace(palabra, '(es|s)$', '') else palabra end
               in public.normalizar(p_lote.titulo || ' ' || p_lote.descripcion || ' ' || p_lote.items::text)
             ) = 0
     );
$$;

-- Lotes que ya avisamos a cada búsqueda (para no repetir el aviso).
create table public.busqueda_coincidencias (
  id uuid primary key default gen_random_uuid(),
  busqueda_id uuid not null references public.busquedas (id) on delete cascade,
  lote_id uuid not null references public.lotes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (busqueda_id, lote_id)
);

alter table public.busqueda_coincidencias enable row level security;
create policy "coincidencias de mis busquedas" on public.busqueda_coincidencias
  for select using (exists (select 1 from public.busquedas b where b.id = busqueda_id and b.usuario_id = auth.uid()));
revoke insert, update, delete on public.busqueda_coincidencias from anon, authenticated;

-- Al publicarse un lote: anota las coincidencias nuevas y devuelve a quién avisar.
-- La llama solo el servidor (después de que el admin publica).
create function public.registrar_coincidencias(p_lote uuid)
returns table (busqueda_id uuid, usuario_id uuid, texto text)
language sql
security definer
set search_path = ''
as $$
  with nuevas as (
    insert into public.busqueda_coincidencias (busqueda_id, lote_id)
    select b.id, l.id
    from public.busquedas b, public.lotes l
    where l.id = p_lote and public.coincide(b, l)
    on conflict do nothing
    returning busqueda_id
  )
  select b.id, b.usuario_id, b.texto from public.busquedas b join nuevas n on n.busqueda_id = b.id;
$$;

-- PUBLIC también, porque por defecto toda función se puede ejecutar.
revoke execute on function public.registrar_coincidencias(uuid) from public, anon, authenticated;

-- Lotes publicados ahora que coinciden con una búsqueda del usuario.
create function public.lotes_para_busqueda(p_busqueda uuid)
returns setof public.lotes
language sql
stable
security definer
set search_path = ''
as $$
  select l.* from public.busquedas b, public.lotes l
  where b.id = p_busqueda and b.usuario_id = auth.uid() and public.coincide(b, l)
  order by l.publicado_at desc
  limit 20;
$$;

revoke execute on function public.lotes_para_busqueda(uuid) from anon;

-- Lo que se está buscando, para que los vendedores vean la demanda. Sin datos
-- de quién lo busca.
create function public.busquedas_publicas()
returns table (texto text, categoria text, zona text, precio_max numeric, created_at timestamptz, cantidad int)
language sql
stable
security definer
set search_path = ''
as $$
  select min(b.texto), b.categoria, b.zona, max(b.precio_max), max(b.created_at), count(*)::int
  from public.busquedas b
  where b.activa
  group by public.normalizar(b.texto), b.categoria, b.zona
  order by max(b.created_at) desc
  limit 60;
$$;

-- ---------------------------------------------------------------------------
-- Baja automática de precio (opcional)
-- ---------------------------------------------------------------------------
-- El vendedor elige cuánto baja por semana (público: se muestra "baja cada
-- semana") y hasta qué precio mínimo (privado: si se viera, nadie ofertaría más).
alter table public.lotes
  add column baja_semanal_pct numeric(4, 1) check (baja_semanal_pct is null or baja_semanal_pct between 1 and 20),
  add column ultima_baja_at timestamptz;

create table public.lote_precio_minimo (
  lote_id uuid primary key references public.lotes (id) on delete cascade,
  precio_minimo numeric(14, 2) not null check (precio_minimo > 0)
);

alter table public.lote_precio_minimo enable row level security;
create policy "precio minimo del vendedor o admin" on public.lote_precio_minimo
  for all using (
    exists (select 1 from public.lotes l where l.id = lote_id and l.vendedor_id = auth.uid())
    or public.es_admin()
  ) with check (
    exists (select 1 from public.lotes l where l.id = lote_id and l.vendedor_id = auth.uid())
    or public.es_admin()
  );
create trigger a_exigir_dos_pasos before insert or update or delete on public.lote_precio_minimo
  for each row execute function public.exigir_dos_pasos();

-- Baja el precio de los lotes publicados que pasaron una semana sin venderse
-- (desde que se publicaron o desde la última baja), sin pasar del mínimo, y
-- redondea a miles. Devuelve los lotes que bajaron. La corre una tarea diaria.
create function public.aplicar_bajas_de_precio()
returns table (lote_id uuid, precio_anterior numeric, precio_nuevo numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidatos as (
    select l.id, l.precio_publicado as anterior,
           greatest(m.precio_minimo, round(l.precio_publicado * (1 - l.baja_semanal_pct / 100) / 1000) * 1000) as nuevo
    from public.lotes l
    join public.lote_precio_minimo m on m.lote_id = l.id
    where l.estado = 'publicado'
      and l.baja_semanal_pct is not null
      and l.precio_publicado > m.precio_minimo
      and coalesce(l.ultima_baja_at, l.publicado_at) <= now() - interval '7 days'
    for update of l
  )
  update public.lotes l
     set precio_publicado = c.nuevo, ultima_baja_at = now()
    from candidatos c
   where l.id = c.id and c.nuevo < c.anterior
  returning l.id, c.anterior, c.nuevo;
end;
$$;

revoke execute on function public.aplicar_bajas_de_precio() from public, anon, authenticated;
