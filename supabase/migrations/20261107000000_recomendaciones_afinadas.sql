-- Ajustes a las recomendaciones: saber desde qué recomendación entró cada
-- persona a un lote (para medir cuáles sirven) y la confianza de cada vendedor.

-- De dónde vino la vista: por ejemplo 'rec-complemento' si entró desde "Para
-- completar la obra". Nulo si llegó por su cuenta.
alter table public.vistas_usuario add column origen text check (origen is null or origen ~ '^rec-[a-z]+$');

drop function public.registrar_vista(uuid);
create function public.registrar_vista(p_lote uuid, p_origen text default null)
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
  insert into public.vistas_usuario (usuario_id, lote_id, origen)
    values (auth.uid(), p_lote, case when p_origen ~ '^rec-[a-z]+$' then p_origen end)
    on conflict (usuario_id, lote_id, dia) do update
      set veces = public.vistas_usuario.veces + 1,
          origen = coalesce(public.vistas_usuario.origen, excluded.origen);
  delete from public.vistas_usuario where usuario_id = auth.uid() and dia < current_date - 180;
end;
$$;

revoke execute on function public.registrar_vista(uuid, text) from public, anon;
grant execute on function public.registrar_vista(uuid, text) to authenticated;

-- Para el admin: cuántas visitas a lotes vinieron de cada tipo de
-- recomendación en los últimos 30 días, y cuántas llegaron por otro lado.
create function public.metricas_recomendaciones()
returns table (origen text, visitas int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  return query
    select coalesce(v.origen, 'directo'), count(*)::int
    from public.vistas_usuario v
    where v.dia > current_date - 30
    group by 1
    order by 2 desc;
end;
$$;

-- Confianza de cada vendedor con lotes publicados: ventas completadas sin
-- reclamos por el material sobre el total (solo números agregados).
create function public.confianza_vendedores()
returns table (vendedor_id uuid, ventas int, ventas_ok int)
language sql
stable
security definer
set search_path = ''
as $$
  select l.vendedor_id,
         count(*) filter (where o.estado = 'completada' or (o.estado = 'reembolsada' and exists (
           select 1 from public.reclamos r where r.oferta_id = o.id and r.motivo = 'no_coincide')))::int,
         count(*) filter (where o.estado = 'completada' and not exists (
           select 1 from public.reclamos r where r.oferta_id = o.id and r.motivo = 'no_coincide'))::int
  from public.lotes l
  join public.ofertas o on o.lote_id = l.id
  where l.vendedor_id in (select distinct vendedor_id from public.lotes where estado = 'publicado')
  group by l.vendedor_id;
$$;
