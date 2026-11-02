-- Recomendaciones: historial de lotes vistos por cada usuario (para recomendar
-- según lo que miró) y señales colectivas del tipo "otros que vieron esto
-- también vieron", siempre agregadas.

-- ---------------------------------------------------------------------------
-- Lotes que vio cada usuario con cuenta
-- ---------------------------------------------------------------------------
-- Una fila por usuario, lote y día. Se guarda 180 días. Lleva id propio para
-- que la API no la tome como tabla de unión entre perfiles y lotes.
create table public.vistas_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  lote_id uuid not null references public.lotes (id) on delete cascade,
  dia date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  veces int not null default 1,
  unique (usuario_id, lote_id, dia)
);
create index vistas_usuario_lote_idx on public.vistas_usuario (lote_id);

alter table public.vistas_usuario enable row level security;
create policy "vistas propias" on public.vistas_usuario
  for select using (usuario_id = auth.uid());
revoke insert, update, delete on public.vistas_usuario from anon, authenticated;

-- La registra el servidor al abrir un lote. No cuenta los lotes propios ni los
-- que no están publicados, y de paso borra lo de más de 180 días del usuario.
create function public.registrar_vista(p_lote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (
    select 1 from public.lotes
    where id = p_lote and estado in ('publicado', 'reservado') and vendedor_id <> auth.uid()
  ) then
    return;
  end if;
  insert into public.vistas_usuario (usuario_id, lote_id) values (auth.uid(), p_lote)
    on conflict (usuario_id, lote_id, dia) do update set veces = public.vistas_usuario.veces + 1;
  delete from public.vistas_usuario where usuario_id = auth.uid() and dia < current_date - 180;
end;
$$;

revoke execute on function public.registrar_vista(uuid) from public, anon;
grant execute on function public.registrar_vista(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Señales colectivas ("otros que vieron esto también vieron")
-- ---------------------------------------------------------------------------
-- Para cada lote publicado: cuántas personas distintas interactuaron (lo vieron,
-- lo guardaron u ofertaron) con alguno de los lotes de p_lotes y también con
-- él, y su popularidad total. Solo devuelve coincidencias de al menos 2 personas
-- (sin contar a p_usuario), para no revelar lo que hizo alguien en particular.
create function public.senales_colectivas(p_lotes uuid[], p_usuario uuid default null)
returns table (lote_id uuid, en_comun int, popularidad int)
language sql
stable
security definer
set search_path = ''
as $$
  with interacciones as (
    select usuario_id, lote_id from public.vistas_usuario where dia > current_date - 180
    union
    select usuario_id, lote_id from public.favoritos
    union
    select comprador_id, lote_id from public.ofertas
  ),
  semillas as (
    select distinct usuario_id from interacciones
    where lote_id = any (p_lotes) and usuario_id is distinct from p_usuario
  ),
  popularidad as (
    select lote_id, count(distinct usuario_id)::int as total from interacciones group by lote_id
  )
  select i.lote_id, count(distinct i.usuario_id)::int, p.total
  from interacciones i
  join semillas s on s.usuario_id = i.usuario_id
  join popularidad p on p.lote_id = i.lote_id
  join public.lotes l on l.id = i.lote_id and l.estado = 'publicado'
  where not (i.lote_id = any (p_lotes))
  group by i.lote_id, p.total
  having count(distinct i.usuario_id) >= 2;
$$;

-- Popularidad de los lotes publicados (personas distintas que interactuaron),
-- para desempatar y para quien todavía no tiene historial.
create function public.popularidad_lotes()
returns table (lote_id uuid, personas int)
language sql
stable
security definer
set search_path = ''
as $$
  with interacciones as (
    select usuario_id, lote_id from public.vistas_usuario where dia > current_date - 30
    union
    select usuario_id, lote_id from public.favoritos
    union
    select comprador_id, lote_id from public.ofertas
  )
  select i.lote_id, count(distinct i.usuario_id)::int
  from interacciones i join public.lotes l on l.id = i.lote_id and l.estado = 'publicado'
  group by i.lote_id;
$$;
