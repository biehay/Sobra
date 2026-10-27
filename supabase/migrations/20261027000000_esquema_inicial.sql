-- Sobrá: esquema inicial del marketplace B2B de sobrantes.
-- Flujo de una operación:
--   vendedor carga lote (borrador -> en_revision)
--   admin verifica y publica con precio sugerido (publicado)
--   comprador verificado oferta (oferta pendiente)
--   vendedor acepta (oferta aceptada, lote reservado)
--   admin confirma el pago al comprador (oferta pagada: se revelan retiro y contactos)
--   admin confirma el retiro y liquida al vendedor (oferta completada, lote vendido)

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.rol as enum ('vendedor', 'comprador', 'admin');
create type public.estado_lote as enum ('borrador', 'en_revision', 'publicado', 'reservado', 'vendido', 'rechazado', 'pausado');
create type public.condicion_material as enum ('nuevo', 'sin_uso', 'usado_buen_estado');
create type public.estado_oferta as enum ('pendiente', 'aceptada', 'rechazada', 'cancelada', 'pagada', 'completada');
create type public.modo_retiro as enum ('retira_comprador', 'flete_sobra');

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol public.rol not null default 'comprador',
  nombre text not null default '',
  empresa text,
  cuit text,
  telefono text,
  zona text,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);

-- Crea el perfil al registrarse. Solo se aceptan los roles vendedor y comprador:
-- los admins se asignan a mano.
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol_pedido text := coalesce(new.raw_user_meta_data ->> 'rol', 'comprador');
begin
  insert into public.perfiles (id, rol, nombre, empresa, cuit, telefono, zona)
  values (
    new.id,
    case when rol_pedido = 'vendedor' then 'vendedor'::public.rol else 'comprador'::public.rol end,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    new.raw_user_meta_data ->> 'empresa',
    new.raw_user_meta_data ->> 'cuit',
    new.raw_user_meta_data ->> 'telefono',
    new.raw_user_meta_data ->> 'zona'
  );
  return new;
end;
$$;

create trigger al_crear_usuario
after insert on auth.users
for each row execute function public.crear_perfil();

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- Un usuario no puede cambiarse el rol ni autoverificarse.
create function public.proteger_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Sin usuario (auth.uid() nulo) es el panel de Supabase o la service role.
  if auth.uid() is not null and not public.es_admin()
     and (new.rol <> old.rol or new.verificado <> old.verificado) then
    raise exception 'Solo un admin puede cambiar el rol o la verificación';
  end if;
  return new;
end;
$$;

create trigger proteger_perfil
before update on public.perfiles
for each row execute function public.proteger_perfil();

-- ---------------------------------------------------------------------------
-- Lotes
-- ---------------------------------------------------------------------------
create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.perfiles (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 5 and 120),
  descripcion text not null default '',
  categoria text not null,
  condicion public.condicion_material not null,
  -- Lista de ítems del lote: [{ "nombre": text, "cantidad": number, "unidad": text }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  zona text not null,
  localidad text not null default '',
  precio_lista numeric(14, 2) check (precio_lista is null or precio_lista > 0),
  precio_pedido numeric(14, 2) not null check (precio_pedido > 0),
  precio_sugerido numeric(14, 2) check (precio_sugerido is null or precio_sugerido > 0),
  precio_publicado numeric(14, 2) check (precio_publicado is null or precio_publicado > 0),
  fotos text[] not null default '{}',
  estado public.estado_lote not null default 'borrador',
  nota_admin text,
  publicado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lotes_estado_idx on public.lotes (estado, publicado_at desc);
create index lotes_vendedor_idx on public.lotes (vendedor_id);

-- El vendedor solo puede mover su lote entre borrador, en revisión y pausado,
-- y no puede tocar el precio publicado ni el sugerido. Publicar, reservar y
-- vender lo hacen el admin o las funciones de operación.
create function public.proteger_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.es_admin() or current_setting('sobra.operacion', true) = 'on' then
    if new.estado = 'publicado' and new.publicado_at is null then
      new.publicado_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado not in ('borrador', 'en_revision') then
      raise exception 'Un lote nuevo solo puede quedar en borrador o en revisión';
    end if;
    new.precio_sugerido := null;
    new.precio_publicado := null;
    new.nota_admin := null;
    new.publicado_at := null;
    return new;
  end if;

  if new.precio_sugerido is distinct from old.precio_sugerido
     or new.precio_publicado is distinct from old.precio_publicado
     or new.nota_admin is distinct from old.nota_admin
     or new.publicado_at is distinct from old.publicado_at
     or new.vendedor_id <> old.vendedor_id then
    raise exception 'No podés modificar campos que gestiona Sobrá';
  end if;

  if old.estado in ('reservado', 'vendido') then
    raise exception 'El lote tiene una operación en curso y no se puede editar';
  end if;

  if new.estado <> old.estado and not (
    (old.estado in ('borrador', 'rechazado') and new.estado = 'en_revision')
    or (old.estado = 'en_revision' and new.estado = 'borrador')
    or (old.estado = 'publicado' and new.estado = 'pausado')
    or (old.estado = 'pausado' and new.estado = 'en_revision')
  ) then
    raise exception 'Cambio de estado no permitido: % -> %', old.estado, new.estado;
  end if;

  -- Si edita un lote publicado o pausado, vuelve a revisión.
  if old.estado in ('publicado', 'pausado') and new.estado = old.estado
     and (new.titulo, new.descripcion, new.categoria, new.condicion, new.items, new.precio_pedido, new.fotos)
         is distinct from (old.titulo, old.descripcion, old.categoria, old.condicion, old.items, old.precio_pedido, old.fotos) then
    new.estado := 'en_revision';
  end if;

  return new;
end;
$$;

create trigger proteger_lote
before insert or update on public.lotes
for each row execute function public.proteger_lote();

-- Datos privados del retiro: solo los ven el vendedor, el admin y el comprador
-- una vez que pagó.
create table public.lote_retiro (
  lote_id uuid primary key references public.lotes (id) on delete cascade,
  direccion text not null default '',
  horarios text not null default '',
  indicaciones text not null default ''
);

-- ---------------------------------------------------------------------------
-- Ofertas y operaciones
-- ---------------------------------------------------------------------------
create table public.ofertas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes (id) on delete cascade,
  comprador_id uuid not null references public.perfiles (id) on delete cascade,
  monto numeric(14, 2) not null check (monto > 0),
  mensaje text not null default '',
  retiro public.modo_retiro not null default 'retira_comprador',
  estado public.estado_oferta not null default 'pendiente',
  comision numeric(14, 2),
  pagada_at timestamptz,
  completada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ofertas_lote_idx on public.ofertas (lote_id);
create index ofertas_comprador_idx on public.ofertas (comprador_id);
create unique index una_oferta_pendiente_por_comprador
  on public.ofertas (lote_id, comprador_id) where estado = 'pendiente';

-- Solo compradores verificados ofertan, sobre lotes publicados, y la oferta
-- nace pendiente.
create function public.validar_oferta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.perfiles
    where id = new.comprador_id and rol = 'comprador' and verificado
  ) then
    raise exception 'Tu cuenta de comprador todavía no está verificada';
  end if;
  if not exists (select 1 from public.lotes where id = new.lote_id and estado = 'publicado') then
    raise exception 'El lote no está disponible';
  end if;
  new.estado := 'pendiente';
  new.comision := null;
  new.pagada_at := null;
  new.completada_at := null;
  return new;
end;
$$;

create trigger validar_oferta
before insert on public.ofertas
for each row execute function public.validar_oferta();

-- Comisión de Sobrá sobre el monto de la operación (hipótesis del Lean Canvas: 10% a 15%).
create function public.tasa_comision()
returns numeric
language sql
immutable
as $$ select 0.12::numeric $$;

-- Las transiciones de una oferta pasan por funciones para que lote y oferta
-- cambien juntos.
create function public.responder_oferta(p_oferta uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ofertas;
  l public.lotes;
begin
  select * into o from public.ofertas where id = p_oferta for update;
  if not found then raise exception 'Oferta inexistente'; end if;
  select * into l from public.lotes where id = o.lote_id for update;
  if l.vendedor_id <> auth.uid() and not public.es_admin() then
    raise exception 'No autorizado';
  end if;
  if o.estado <> 'pendiente' then raise exception 'La oferta ya fue respondida'; end if;

  if not p_aceptar then
    update public.ofertas set estado = 'rechazada', updated_at = now() where id = o.id;
    return;
  end if;

  if l.estado <> 'publicado' then raise exception 'El lote no está disponible'; end if;

  perform set_config('sobra.operacion', 'on', true);
  update public.ofertas
    set estado = 'aceptada', comision = round(o.monto * public.tasa_comision(), 2), updated_at = now()
    where id = o.id;
  update public.ofertas
    set estado = 'rechazada', updated_at = now()
    where lote_id = l.id and id <> o.id and estado = 'pendiente';
  update public.lotes set estado = 'reservado' where id = l.id;
  perform set_config('sobra.operacion', 'off', true);
end;
$$;

create function public.cancelar_oferta(p_oferta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ofertas;
begin
  select * into o from public.ofertas where id = p_oferta for update;
  if not found then raise exception 'Oferta inexistente'; end if;
  if o.comprador_id <> auth.uid() and not public.es_admin() then
    raise exception 'No autorizado';
  end if;
  if o.estado = 'pendiente' then
    update public.ofertas set estado = 'cancelada', updated_at = now() where id = o.id;
  elsif o.estado = 'aceptada' then
    perform set_config('sobra.operacion', 'on', true);
    update public.ofertas set estado = 'cancelada', comision = null, updated_at = now() where id = o.id;
    update public.lotes set estado = 'publicado' where id = o.lote_id;
    perform set_config('sobra.operacion', 'off', true);
  else
    raise exception 'La oferta ya no se puede cancelar';
  end if;
end;
$$;

create function public.confirmar_pago(p_oferta uuid)
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
end;
$$;

create function public.completar_operacion(p_oferta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ofertas;
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  update public.ofertas
    set estado = 'completada', completada_at = now(), updated_at = now()
    where id = p_oferta and estado = 'pagada'
    returning * into o;
  if not found then raise exception 'La oferta no está pagada'; end if;
  update public.lotes set estado = 'vendido' where id = o.lote_id;
end;
$$;

-- Contactos de la contraparte y datos de retiro, solo cuando la operación está paga.
create function public.datos_operacion(p_oferta uuid)
returns table (
  vendedor_nombre text, vendedor_empresa text, vendedor_telefono text,
  comprador_nombre text, comprador_empresa text, comprador_telefono text,
  direccion text, horarios text, indicaciones text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.nombre, v.empresa, v.telefono,
         c.nombre, c.empresa, c.telefono,
         r.direccion, r.horarios, r.indicaciones
  from public.ofertas o
  join public.lotes l on l.id = o.lote_id
  join public.perfiles v on v.id = l.vendedor_id
  join public.perfiles c on c.id = o.comprador_id
  left join public.lote_retiro r on r.lote_id = l.id
  where o.id = p_oferta
    and o.estado in ('pagada', 'completada')
    and (auth.uid() in (o.comprador_id, l.vendedor_id) or public.es_admin());
$$;

-- ---------------------------------------------------------------------------
-- Seguridad a nivel de fila
-- ---------------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.lotes enable row level security;
alter table public.lote_retiro enable row level security;
alter table public.ofertas enable row level security;

create policy "perfil propio o admin" on public.perfiles
  for select using (id = auth.uid() or public.es_admin());
create policy "editar perfil propio o admin" on public.perfiles
  for update using (id = auth.uid() or public.es_admin());

create policy "lotes visibles" on public.lotes
  for select using (
    estado in ('publicado', 'reservado', 'vendido')
    or vendedor_id = auth.uid()
    or public.es_admin()
  );
create policy "vendedor crea sus lotes" on public.lotes
  for insert with check (
    vendedor_id = auth.uid()
    and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'vendedor')
  );
create policy "vendedor edita sus lotes" on public.lotes
  for update using (vendedor_id = auth.uid() or public.es_admin());
create policy "vendedor borra borradores" on public.lotes
  for delete using ((vendedor_id = auth.uid() and estado in ('borrador', 'rechazado')) or public.es_admin());

create policy "retiro del vendedor o admin" on public.lote_retiro
  for all using (
    exists (select 1 from public.lotes l where l.id = lote_id and l.vendedor_id = auth.uid())
    or public.es_admin()
  ) with check (
    exists (select 1 from public.lotes l where l.id = lote_id and l.vendedor_id = auth.uid())
    or public.es_admin()
  );

create policy "ofertas visibles" on public.ofertas
  for select using (
    comprador_id = auth.uid()
    or exists (select 1 from public.lotes l where l.id = lote_id and l.vendedor_id = auth.uid())
    or public.es_admin()
  );
create policy "comprador oferta" on public.ofertas
  for insert with check (comprador_id = auth.uid());

-- Las ofertas no se editan directamente: solo por las funciones de arriba.
revoke update, delete on public.ofertas from anon, authenticated;
revoke execute on function public.confirmar_pago(uuid), public.completar_operacion(uuid) from anon;
revoke execute on function public.responder_oferta(uuid, boolean), public.cancelar_oferta(uuid), public.datos_operacion(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Fotos de los lotes
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lotes', 'lotes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "subir fotos en carpeta propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lotes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar fotos propias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lotes' and (storage.foldername(name))[1] = auth.uid()::text);
