-- Código de retiro y reclamos.
--
-- Al confirmarse el pago, el comprador recibe un código de 6 dígitos. En el
-- retiro revisa el material y, si está todo bien, se lo da al vendedor, que lo
-- carga en su panel: eso completa la operación (y, con Mercado Pago, libera la
-- plata). Si algo sale mal, cualquiera de los dos abre un reclamo y el admin
-- decide: devolver el pago al comprador o completar la venta.

alter type public.estado_oferta add value if not exists 'reembolsada';

-- ---------------------------------------------------------------------------
-- Código de retiro
-- ---------------------------------------------------------------------------
-- Tabla aparte de ofertas porque el vendedor puede leer las ofertas de sus
-- lotes y no tiene que ver el código: solo el comprador.
create table public.codigos_retiro (
  oferta_id uuid primary key references public.ofertas (id) on delete cascade,
  codigo text not null check (codigo ~ '^[0-9]{6}$'),
  intentos_fallidos int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.codigos_retiro enable row level security;
create policy "solo el comprador ve su código" on public.codigos_retiro
  for select using (
    exists (select 1 from public.ofertas o where o.id = oferta_id and o.comprador_id = auth.uid())
  );
revoke insert, update, delete on public.codigos_retiro from anon, authenticated;

-- 6 dígitos a partir de gen_random_uuid(), que usa un generador criptográfico
-- (random() es predecible).
create function public.nuevo_codigo_retiro()
returns text
language sql
volatile
as $$
  select lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;

create or replace function public.confirmar_pago(p_oferta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  update public.ofertas
    set estado = 'pagada', pagada_at = now(), updated_at = now()
    where id = p_oferta and estado = 'aceptada';
  if not found then raise exception 'La oferta no está aceptada'; end if;
  insert into public.codigos_retiro (oferta_id, codigo) values (p_oferta, public.nuevo_codigo_retiro());
end;
$$;

-- El vendedor carga el código que le da el comprador en el retiro. Después de
-- 5 intentos fallidos se bloquea (para que no se pueda adivinar) y lo
-- resuelve el admin.
create function public.confirmar_retiro(p_oferta uuid, p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ofertas;
  c public.codigos_retiro;
begin
  select * into o from public.ofertas where id = p_oferta for update;
  if not found then raise exception 'Operación inexistente'; end if;
  if not exists (select 1 from public.lotes where id = o.lote_id and vendedor_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;
  if o.estado <> 'pagada' then raise exception 'La operación no está esperando el retiro'; end if;
  if exists (select 1 from public.reclamos where oferta_id = p_oferta and estado = 'abierto') then
    raise exception 'Hay un reclamo abierto: lo resuelve Sobrá';
  end if;

  select * into c from public.codigos_retiro where oferta_id = p_oferta for update;
  if c.intentos_fallidos >= 5 then
    raise exception 'Demasiados intentos fallidos. Escribinos para resolverlo.';
  end if;
  if c.codigo <> regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g') then
    -- Se devuelve false en vez de fallar para que el intento quede registrado.
    update public.codigos_retiro set intentos_fallidos = intentos_fallidos + 1 where oferta_id = p_oferta;
    return false;
  end if;

  update public.ofertas set estado = 'completada', completada_at = now(), updated_at = now() where id = p_oferta;
  perform set_config('sobra.operacion', 'on', true);
  update public.lotes set estado = 'vendido' where id = o.lote_id;
  perform set_config('sobra.operacion', 'off', true);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reclamos
-- ---------------------------------------------------------------------------
create type public.motivo_reclamo as enum ('no_coincide', 'no_se_presento', 'otro');
create type public.resultado_reclamo as enum ('devolver', 'completar', 'sin_cambios');

create table public.reclamos (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  autor_id uuid not null references public.perfiles (id) on delete cascade,
  motivo public.motivo_reclamo not null,
  detalle text not null check (char_length(detalle) between 10 and 2000),
  estado text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  resultado public.resultado_reclamo,
  resolucion text,
  created_at timestamptz not null default now(),
  resuelto_at timestamptz
);

create unique index un_reclamo_abierto_por_operacion on public.reclamos (oferta_id) where estado = 'abierto';

alter table public.reclamos enable row level security;
create policy "reclamos de la operación" on public.reclamos
  for select using (
    exists (
      select 1 from public.ofertas o join public.lotes l on l.id = o.lote_id
      where o.id = oferta_id and auth.uid() in (o.comprador_id, l.vendedor_id)
    )
    or public.es_admin()
  );
revoke insert, update, delete on public.reclamos from anon, authenticated;

create function public.abrir_reclamo(p_oferta uuid, p_motivo public.motivo_reclamo, p_detalle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ofertas;
  id_reclamo uuid;
begin
  select * into o from public.ofertas where id = p_oferta;
  if not found then raise exception 'Operación inexistente'; end if;
  if auth.uid() is distinct from o.comprador_id
     and not exists (select 1 from public.lotes where id = o.lote_id and vendedor_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;
  if o.estado <> 'pagada' then raise exception 'Solo se puede reclamar sobre una operación paga pendiente de retiro'; end if;
  if exists (select 1 from public.reclamos where oferta_id = p_oferta and estado = 'abierto') then
    raise exception 'Ya hay un reclamo abierto para esta operación';
  end if;

  insert into public.reclamos (oferta_id, autor_id, motivo, detalle)
  values (p_oferta, auth.uid(), p_motivo, trim(p_detalle))
  returning id into id_reclamo;
  return id_reclamo;
end;
$$;

-- El admin resuelve: devolver el pago (la oferta queda reembolsada y el lote
-- pausado para revisarlo), completar la venta, o cerrar sin cambios (por
-- ejemplo, si se pusieron de acuerdo y el retiro sigue pendiente).
create function public.resolver_reclamo(p_reclamo uuid, p_resultado public.resultado_reclamo, p_resolucion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reclamos;
  o public.ofertas;
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_resolucion), '') = '' then raise exception 'Explicá la resolución'; end if;
  select * into r from public.reclamos where id = p_reclamo for update;
  if not found or r.estado <> 'abierto' then raise exception 'El reclamo no está abierto'; end if;
  select * into o from public.ofertas where id = r.oferta_id for update;

  update public.reclamos
    set estado = 'resuelto', resultado = p_resultado, resolucion = trim(p_resolucion), resuelto_at = now()
    where id = p_reclamo;

  if p_resultado = 'devolver' then
    update public.ofertas set estado = 'reembolsada', updated_at = now() where id = o.id;
    update public.lotes set estado = 'pausado' where id = o.lote_id;
  elsif p_resultado = 'completar' then
    update public.ofertas set estado = 'completada', completada_at = now(), updated_at = now() where id = o.id;
    update public.lotes set estado = 'vendido' where id = o.lote_id;
  end if;
end;
$$;

-- Con un reclamo abierto, el admin no completa la operación sin resolverlo.
create or replace function public.completar_operacion(p_oferta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ofertas;
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  if exists (select 1 from public.reclamos where oferta_id = p_oferta and estado = 'abierto') then
    raise exception 'Hay un reclamo abierto: resolvelo primero';
  end if;
  update public.ofertas
    set estado = 'completada', completada_at = now(), updated_at = now()
    where id = p_oferta and estado = 'pagada'
    returning * into o;
  if not found then raise exception 'La oferta no está pagada'; end if;
  update public.lotes set estado = 'vendido' where id = o.lote_id;
end;
$$;

revoke execute on function public.confirmar_retiro(uuid, text), public.abrir_reclamo(uuid, public.motivo_reclamo, text),
  public.resolver_reclamo(uuid, public.resultado_reclamo, text), public.nuevo_codigo_retiro() from anon;
revoke execute on function public.nuevo_codigo_retiro() from authenticated;
