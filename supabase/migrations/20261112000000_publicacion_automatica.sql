-- Publicación automática para vendedores de confianza. Un lote enviado a revisión
-- se publica al instante si el vendedor es de confianza y el lote pasa los
-- controles automáticos; si no, queda en revisión manual como siempre.
--
-- Vendedor de confianza: cuenta verificada por Sobrá y, además, CUIT cargado
-- (empresa) o al menos una venta completada sin reclamos por el material.
-- Controles: al menos una foto, peso cargado, dirección de retiro, sin datos de
-- contacto en el texto (teléfonos, emails, links, WhatsApp) y un precio que no
-- supere al precio de lista que cargó.

-- Para que el admin vea cuáles se publicaron sin revisión manual.
alter table public.lotes add column if not exists publicado_automatico boolean not null default false;

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

-- Devuelve 'publicado' o el motivo por el que queda en revisión manual.
create or replace function public.publicar_automatico(p_lote uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  texto text;
begin
  select * into l from public.lotes where id = p_lote;
  if not found or l.vendedor_id is distinct from auth.uid() then raise exception 'No autorizado'; end if;
  if l.estado <> 'en_revision' then return 'no_en_revision'; end if;
  if not public.vendedor_de_confianza(l.vendedor_id) then return 'no_confiable'; end if;
  if cardinality(l.fotos) = 0 then return 'sin_fotos'; end if;
  if l.peso_kg is null then return 'sin_peso'; end if;
  if not exists (select 1 from public.lote_retiro r where r.lote_id = p_lote and trim(r.direccion) <> '') then
    return 'sin_retiro';
  end if;
  texto := concat_ws(' ', l.titulo, l.descripcion, l.items::text);
  if texto ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or texto ~* '(https?://|www\.)'
     or texto ~* '(whats ?app|\mwsp\M|\mwpp\M)'
     or texto ~ '(\d[\s.-]?){8,}' then
    return 'contacto';
  end if;
  if l.precio_lista is not null and l.precio_pedido > l.precio_lista then return 'precio'; end if;

  perform set_config('sobra.operacion', 'on', true);
  update public.lotes
    set estado = 'publicado', precio_publicado = l.precio_pedido, nota_admin = null, publicado_automatico = true
    where id = p_lote;
  perform set_config('sobra.operacion', 'off', true);
  return 'publicado';
end;
$$;

revoke execute on function public.vendedor_de_confianza(uuid) from public, anon;
grant execute on function public.vendedor_de_confianza(uuid) to authenticated;
revoke execute on function public.publicar_automatico(uuid) from public, anon;
grant execute on function public.publicar_automatico(uuid) to authenticated;

-- Si el admin vuelve a revisar un lote (lo devuelve o lo aprueba él), deja de figurar como automático.
