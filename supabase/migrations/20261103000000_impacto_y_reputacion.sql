-- Impacto ambiental de cada operación (constancias verificables) y reputación
-- calculada con hechos de las operaciones, no con estrellas.

-- ---------------------------------------------------------------------------
-- Peso de cada lote
-- ---------------------------------------------------------------------------
-- Lo declara el vendedor y lo confirma el admin al revisar el lote.
alter table public.lotes add column peso_kg numeric(12, 2) check (peso_kg is null or peso_kg > 0);

-- Si el vendedor cambia el peso de un lote publicado, vuelve a revisión (así no
-- se puede inflar el impacto después de que el admin lo revisó).
create function public.proteger_peso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.peso_kg is distinct from old.peso_kg and not public.es_admin()
     and old.estado in ('publicado', 'pausado') then
    new.estado := 'en_revision';
  end if;
  return new;
end;
$$;

create trigger proteger_peso before update on public.lotes
  for each row execute function public.proteger_peso();

-- ---------------------------------------------------------------------------
-- Factores de CO₂
-- ---------------------------------------------------------------------------
-- Kilos de CO₂ equivalente que cuesta fabricar 1 kg de material nuevo, por
-- categoría. Son valores de referencia aproximados, tomados de bases públicas
-- de carbono incorporado (como ICE, de la Universidad de Bath). Comprar
-- material recuperado evita fabricar ese material nuevo.
create function public.factor_co2(p_categoria text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_categoria
    when 'Cerámicos y porcelanatos' then 0.78
    when 'Sanitarios y grifería' then 1.6
    when 'Electricidad e iluminación' then 3.0
    when 'Plomería y gas' then 2.5
    when 'Cemento, cal y áridos' then 0.5
    when 'Hierros y perfiles' then 1.55
    when 'Maderas y placas' then 0.45
    when 'Aberturas' then 3.0
    when 'Pinturas e impermeabilizantes' then 2.5
    when 'Aislantes y durlock' then 0.6
    when 'Herramientas y equipos' then 2.0
    else 1.0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Impacto del usuario
-- ---------------------------------------------------------------------------
-- Operaciones completadas del usuario con su impacto. Para no contar dos veces
-- lo mismo: al vendedor se le cuentan los kilos que no fueron a residuos y al
-- comprador los kilos reutilizados y el CO₂ que se evitó al no fabricarlos.
create function public.mi_impacto()
returns table (oferta_id uuid, titulo text, categoria text, rol text, kg numeric, co2 numeric, completada_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, l.titulo, l.categoria,
         case when l.vendedor_id = auth.uid() then 'vendedor' else 'comprador' end,
         l.peso_kg,
         case when l.vendedor_id = auth.uid() then 0 else round(l.peso_kg * public.factor_co2(l.categoria), 1) end,
         o.completada_at
  from public.ofertas o
  join public.lotes l on l.id = o.lote_id
  where o.estado = 'completada' and l.peso_kg is not null
    and (l.vendedor_id = auth.uid() or o.comprador_id = auth.uid())
  order by o.completada_at desc;
$$;

revoke execute on function public.mi_impacto() from anon;

-- ---------------------------------------------------------------------------
-- Constancias de material recuperado
-- ---------------------------------------------------------------------------
-- Cada constancia queda guardada con sus números del momento en que se emitió,
-- y cualquiera la puede validar con el código.
create table public.constancias (
  codigo text primary key,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  anio int not null,
  kg_recuperados numeric(14, 2) not null, -- como vendedor: no fueron a residuos
  kg_reutilizados numeric(14, 2) not null, -- como comprador: no se fabricaron nuevos
  co2_evitado numeric(14, 1) not null,
  operaciones int not null,
  emitida_at timestamptz not null default now()
);

alter table public.constancias enable row level security;
create policy "constancias propias" on public.constancias
  for select using (usuario_id = auth.uid());
revoke insert, update, delete on public.constancias from anon, authenticated;

create function public.emitir_constancia(p_anio int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
  v_recuperados numeric;
  v_reutilizados numeric;
  v_co2 numeric;
  v_operaciones int;
begin
  if auth.uid() is null or not public.sesion_segura() then
    raise exception 'Ingresá el código que te enviamos por email para operar en Sobrá';
  end if;

  select coalesce(sum(case when l.vendedor_id = auth.uid() then l.peso_kg end), 0),
         coalesce(sum(case when o.comprador_id = auth.uid() then l.peso_kg end), 0),
         coalesce(sum(case when o.comprador_id = auth.uid() then round(l.peso_kg * public.factor_co2(l.categoria), 1) end), 0),
         count(*)
    into v_recuperados, v_reutilizados, v_co2, v_operaciones
  from public.ofertas o
  join public.lotes l on l.id = o.lote_id
  where o.estado = 'completada' and l.peso_kg is not null
    and (l.vendedor_id = auth.uid() or o.comprador_id = auth.uid())
    and extract(year from o.completada_at at time zone 'America/Argentina/Buenos_Aires') = p_anio;

  if v_operaciones = 0 then
    raise exception 'Todavía no tenés operaciones completadas en %', p_anio;
  end if;

  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.constancias (codigo, usuario_id, anio, kg_recuperados, kg_reutilizados, co2_evitado, operaciones)
    values (v_codigo, auth.uid(), p_anio, v_recuperados, v_reutilizados, v_co2, v_operaciones);
  return v_codigo;
end;
$$;

revoke execute on function public.emitir_constancia(int) from anon;

-- Validación pública de una constancia: muestra a nombre de quién está y sus
-- números, nada más.
create function public.verificar_constancia(p_codigo text)
returns table (titular text, anio int, kg_recuperados numeric, kg_reutilizados numeric, co2_evitado numeric, operaciones int, emitida_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.empresa, ''), p.nombre), c.anio, c.kg_recuperados, c.kg_reutilizados, c.co2_evitado, c.operaciones, c.emitida_at
  from public.constancias c
  join public.perfiles p on p.id = c.usuario_id
  where c.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Total de la plataforma, para mostrar en la portada.
create function public.impacto_total()
returns table (kg numeric, co2 numeric, operaciones int)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.peso_kg), 0), coalesce(sum(round(l.peso_kg * public.factor_co2(l.categoria), 1)), 0), count(*)::int
  from public.ofertas o
  join public.lotes l on l.id = o.lote_id
  where o.estado = 'completada' and l.peso_kg is not null;
$$;

-- ---------------------------------------------------------------------------
-- Reputación con hechos
-- ---------------------------------------------------------------------------
-- Cuándo respondió el vendedor cada oferta, para medir qué tan rápido responde.
alter table public.ofertas add column respondida_at timestamptz;

create function public.marcar_respuesta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.respondida_at := null;
  elsif old.estado = 'pendiente' and new.estado in ('aceptada', 'rechazada') then
    new.respondida_at := now();
  end if;
  return new;
end;
$$;

create trigger marcar_respuesta before insert or update on public.ofertas
  for each row execute function public.marcar_respuesta();

-- Reputación pública de un usuario: solo números agregados, sin datos personales.
-- - ventas: operaciones como vendedor que llegaron al final (completadas, o
--   devueltas porque el material no coincidía); ventas_ok: completadas sin ese reclamo.
-- - compras: operaciones como comprador completadas o en las que no se presentó
--   a retirar; compras_ok: completadas.
-- - horas_respuesta: promedio de lo que tardó en responder ofertas (últimos 180 días).
create function public.reputacion(p_usuario uuid)
returns table (ventas int, ventas_ok int, compras int, compras_ok int, horas_respuesta numeric, desde timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select o.estado, o.created_at, o.respondida_at,
           exists (select 1 from public.reclamos r where r.oferta_id = o.id and r.motivo = 'no_coincide') as no_coincide
    from public.ofertas o
    join public.lotes l on l.id = o.lote_id
    where l.vendedor_id = p_usuario
  ),
  c as (
    select o.estado,
           exists (
             select 1 from public.reclamos r join public.lotes l on l.id = o.lote_id
             where r.oferta_id = o.id and r.motivo = 'no_se_presento' and r.autor_id = l.vendedor_id
           ) as falto
    from public.ofertas o
    where o.comprador_id = p_usuario
  )
  select
    (select count(*) from v where estado = 'completada' or (estado = 'reembolsada' and no_coincide))::int,
    (select count(*) from v where estado = 'completada' and not no_coincide)::int,
    (select count(*) from c where estado = 'completada' or falto)::int,
    (select count(*) from c where estado = 'completada' and not falto)::int,
    (select round(avg(extract(epoch from respondida_at - created_at)) / 3600, 1) from v
      where respondida_at is not null and created_at > now() - interval '180 days'),
    (select created_at from public.perfiles where id = p_usuario);
$$;
