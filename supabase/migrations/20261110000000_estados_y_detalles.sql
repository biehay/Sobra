-- Más estados del material y "detalles a tener en cuenta" (vence pronto, faltan
-- accesorios, cajas de distintos lotes...). Sirven para que el precio sugerido
-- dependa de lo que se vende y el comprador sepa exactamente qué compra.

-- Nuevos estados (los anteriores siguen igual: nuevo, sin_uso, usado_buen_estado).
alter type public.condicion_material add value if not exists 'usado_como_nuevo' after 'sin_uso';
alter type public.condicion_material add value if not exists 'usado_con_detalles' after 'usado_buen_estado';
alter type public.condicion_material add value if not exists 'para_reparar' after 'usado_con_detalles';

-- Detalles del lote (códigos de src/lib/depreciacion.ts). Los valida el servidor.
alter table public.lotes add column if not exists detalles text[] not null default '{}'
  check (cardinality(detalles) <= 10 and array_to_string(detalles, ',') ~ '^[a-z_,]*$');

-- Si el vendedor cambia los detalles de un lote publicado, vuelve a revisión
-- (igual que con el título, las fotos o el precio).
create or replace function public.proteger_lote()
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
     and (new.titulo, new.descripcion, new.categoria, new.condicion, new.items, new.precio_pedido, new.fotos, new.detalles)
         is distinct from (old.titulo, old.descripcion, old.categoria, old.condicion, old.items, old.precio_pedido, old.fotos, old.detalles) then
    new.estado := 'en_revision';
  end if;

  return new;
end;
$$;

