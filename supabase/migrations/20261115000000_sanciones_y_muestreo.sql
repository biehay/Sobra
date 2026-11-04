-- Reputación del vendedor: faltas y sanciones escalonadas, y muestreo para controlar
-- a la moderación automática.
--
-- Faltas: las suma una persona (el admin, al dar de baja un lote por denuncias, al
-- resolver un reclamo a favor del comprador o al encontrar un lote mal publicado en
-- el muestreo) o la baja automática por denuncias de 5 personas. La IA sola nunca
-- suma faltas. Cuentan las de los últimos 180 días que el admin no anuló:
--   1 falta: advertencia.
--   2 faltas: pierde la publicación al instante (todo lo revisa una persona).
--   3 faltas: no puede publicar durante 30 días desde la tercera.
--   4 o más: no puede publicar hasta que el admin revise la cuenta (y anule faltas).
--
-- Muestreo: 1 de cada 20 lotes que la moderación publica al instante queda marcado
-- para que el admin lo revise y diga si estuvo bien. Así se mide cuánto se equivoca.

create table public.faltas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  lote_id uuid references public.lotes (id) on delete set null,
  origen text not null check (origen in ('denuncias', 'reclamo', 'muestreo', 'manual')),
  detalle text not null check (char_length(detalle) between 1 and 500),
  anulada boolean not null default false,
  created_at timestamptz not null default now()
);
create index faltas_usuario_idx on public.faltas (usuario_id, created_at desc);
alter table public.faltas enable row level security;
revoke all on public.faltas from anon, authenticated;
grant select on public.faltas to authenticated;
create policy "Cada uno ve sus faltas" on public.faltas for select to authenticated using (usuario_id = auth.uid());
create policy "El admin ve las faltas" on public.faltas for select to authenticated using (public.es_admin());

create or replace function public.faltas_activas(p_usuario uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.faltas
  where usuario_id = p_usuario and not anulada and created_at > now() - interval '180 days';
$$;

-- Hasta cuándo no puede publicar (null si puede). 'infinity' = hasta que lo revise el admin.
create or replace function public.suspendido_hasta(p_usuario uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n int := public.faltas_activas(p_usuario);
  hasta timestamptz;
begin
  if n >= 4 then return 'infinity'; end if;
  if n = 3 then
    select max(created_at) + interval '30 days' into hasta from public.faltas
      where usuario_id = p_usuario and not anulada and created_at > now() - interval '180 days';
    if hasta > now() then return hasta; end if;
  end if;
  return null;
end;
$$;

-- Suma una falta. Solo el admin (o las funciones de Sobrá). Devuelve las faltas activas.
create or replace function public.sumar_falta(p_usuario uuid, p_lote uuid, p_origen text, p_detalle text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.es_admin() then raise exception 'No autorizado'; end if;
  insert into public.faltas (usuario_id, lote_id, origen, detalle) values (p_usuario, p_lote, p_origen, left(trim(p_detalle), 500));
  return public.faltas_activas(p_usuario);
end;
$$;

-- El admin anula una falta (se equivocó, o el vendedor lo aclaró).
create or replace function public.anular_falta(p_falta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  update public.faltas set anulada = true where id = p_falta;
end;
$$;

revoke execute on function public.faltas_activas(uuid) from public, anon;
revoke execute on function public.suspendido_hasta(uuid) from public, anon;
revoke execute on function public.sumar_falta(uuid, uuid, text, text) from public, anon;
revoke execute on function public.anular_falta(uuid) from public, anon;
grant execute on function public.faltas_activas(uuid) to authenticated, service_role;
grant execute on function public.suspendido_hasta(uuid) to authenticated, service_role;
grant execute on function public.sumar_falta(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.anular_falta(uuid) to authenticated;

-- Con la cuenta suspendida no se puede enviar un lote a revisión (los borradores sí).
create or replace function public.proteger_suspension()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hasta timestamptz;
begin
  if auth.uid() is null or public.es_admin() or current_setting('sobra.operacion', true) = 'on' then
    return new;
  end if;
  if new.estado = 'en_revision' and (tg_op = 'INSERT' or old.estado <> 'en_revision') then
    hasta := public.suspendido_hasta(new.vendedor_id);
    if hasta = 'infinity' then
      raise exception 'Tu cuenta no puede publicar hasta que la revisemos. Escribinos para resolverlo';
    elsif hasta is not null then
      raise exception 'Tu cuenta no puede publicar hasta el %', to_char(hasta at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY');
    end if;
  end if;
  return new;
end;
$$;
create trigger proteger_suspension before insert or update on public.lotes
  for each row execute function public.proteger_suspension();

-- Con alguna falta activa, la cuenta deja de ser de confianza.
create or replace function public.vendedor_de_confianza(p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = p_vendedor
      and p.verificado
      and public.faltas_activas(p_vendedor) = 0
      and (
        nullif(trim(coalesce(p.cuit, '')), '') is not null
        or exists (
          select 1 from public.ofertas o
          join public.lotes l on l.id = o.lote_id
          where l.vendedor_id = p_vendedor
            and o.estado = 'completada'
            and not exists (select 1 from public.reclamos r where r.oferta_id = o.id and r.motivo = 'no_coincide')
        )
      )
  );
$$;

-- Muestreo y auditoría de la moderación.
alter table public.moderaciones add column if not exists muestreo boolean not null default false;
-- Lo que dijo el admin al revisarla: 'acierto' o 'error'.
alter table public.moderaciones add column if not exists auditoria text check (auditoria in ('acierto', 'error'));
alter table public.moderaciones add column if not exists auditada_at timestamptz;
grant update (auditoria, auditada_at) on public.moderaciones to authenticated;
create policy "El admin audita las moderaciones" on public.moderaciones for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- moderar_lote: con 2 o más faltas, todo a revisión manual; y 1 de cada 20 publicados
-- al instante queda en el muestreo. (La proporción se puede cambiar con la variable
-- sobra.muestreo, por ejemplo en las pruebas.)
create or replace function public.moderar_lote(p_lote uuid, p_resultado text, p_motivos jsonb, p_mensaje text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  aplicado text;
  publicados_hoy int;
  proporcion numeric := coalesce(nullif(current_setting('sobra.muestreo', true), '')::numeric, 0.05);
begin
  if p_resultado not in ('aprobado', 'dudoso', 'rechazado') then raise exception 'Resultado inválido'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if not found then raise exception 'Lote inexistente'; end if;

  if l.estado <> 'en_revision' then
    aplicado := 'no_en_revision';
  elsif p_resultado = 'rechazado' then
    perform set_config('sobra.operacion', 'on', true);
    update public.lotes
      set estado = 'rechazado', nota_admin = coalesce(nullif(trim(p_mensaje), ''), 'No cumple las reglas de publicación de Sobrá.')
      where id = p_lote;
    perform set_config('sobra.operacion', 'off', true);
    aplicado := 'rechazado';
  elsif p_resultado = 'dudoso' then
    aplicado := 'dudoso';
  elsif exists (select 1 from public.denuncias where lote_id = p_lote and estado = 'abierta') then
    aplicado := 'denuncias';
  elsif public.faltas_activas(l.vendedor_id) >= 2 then
    aplicado := 'faltas';
  else
    aplicado := public.controles_publicacion(p_lote);
    if aplicado = 'ok' and not public.vendedor_de_confianza(l.vendedor_id) then
      if not exists (select 1 from public.lotes where vendedor_id = l.vendedor_id and publicado_at is not null) then
        aplicado := 'primera_publicacion';
      else
        select count(*) into publicados_hoy from public.lotes
          where vendedor_id = l.vendedor_id and publicado_automatico and publicado_at > now() - interval '1 day';
        if publicados_hoy >= 3 then aplicado := 'limite_diario'; end if;
      end if;
    end if;
    if aplicado = 'ok' then
      perform set_config('sobra.operacion', 'on', true);
      update public.lotes
        set estado = 'publicado', precio_publicado = l.precio_pedido, nota_admin = null, publicado_automatico = true
        where id = p_lote;
      perform set_config('sobra.operacion', 'off', true);
      aplicado := 'publicado';
    end if;
  end if;

  insert into public.moderaciones (lote_id, resultado, motivos, aplicado, muestreo)
  values (p_lote, p_resultado, coalesce(p_motivos, '[]'::jsonb), aplicado, aplicado = 'publicado' and random() < proporcion);
  return aplicado;
end;
$$;

-- denunciar_lote: la baja automática por denuncias de 5 personas también suma una falta.
create or replace function public.denunciar_lote(p_lote uuid, p_motivo text, p_detalle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  l public.lotes;
  personas int;
  en_total int;
begin
  if yo is null then raise exception 'Ingresá a tu cuenta para denunciar'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if not found or l.estado not in ('publicado', 'reservado') then raise exception 'Esta publicación no se puede denunciar'; end if;
  if l.vendedor_id = yo then raise exception 'No podés denunciar tu propia publicación'; end if;
  if (select count(*) from public.denuncias where autor_id = yo and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Llegaste al límite de denuncias por hoy';
  end if;

  insert into public.denuncias (lote_id, titulo, vendedor_id, autor_id, motivo, detalle)
  values (p_lote, l.titulo, l.vendedor_id, yo, p_motivo, left(trim(coalesce(p_detalle, '')), 500))
  on conflict (lote_id, autor_id) do nothing;
  if not found then return 'ya_denunciada'; end if;

  select count(*) filter (where estado = 'abierta'), count(*) into personas, en_total
    from public.denuncias where lote_id = p_lote;

  if en_total >= 5 and l.estado = 'publicado'
     and exists (select 1 from public.denuncias where lote_id = p_lote and estado = 'desestimada') then
    perform set_config('sobra.operacion', 'on', true);
    update public.lotes
      set estado = 'rechazado', pausado_por_denuncias = false, publicado_automatico = false,
          nota_admin = 'Lo dimos de baja porque lo denunciaron ' || en_total || ' personas. Si creés que es un error, escribinos.'
      where id = p_lote;
    perform set_config('sobra.operacion', 'off', true);
    update public.denuncias set estado = 'baja', resuelta_at = now() where lote_id = p_lote and estado = 'abierta';
    insert into public.faltas (usuario_id, lote_id, origen, detalle)
      values (l.vendedor_id, p_lote, 'denuncias', 'Lote dado de baja automáticamente: lo denunciaron ' || en_total || ' personas.');
    return 'baja';
  end if;

  if personas >= 3 and l.estado = 'publicado' then
    perform set_config('sobra.operacion', 'on', true);
    update public.lotes
      set estado = 'pausado', pausado_por_denuncias = true,
          nota_admin = 'Lo pausamos porque varios usuarios lo denunciaron. Lo estamos revisando y te avisamos por email.'
      where id = p_lote;
    perform set_config('sobra.operacion', 'off', true);
    return 'pausado';
  end if;
  return 'denunciada';
end;
$$;
