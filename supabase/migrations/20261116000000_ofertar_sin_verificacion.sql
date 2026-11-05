-- El comprador ya no necesita que el admin lo verifique para ofertar: alcanza con
-- su cuenta (email confirmado y código de acceso). Como el comprador paga antes de
-- retirar, el riesgo es bajo; para evitar que una cuenta nueva reserve lotes de más,
-- mientras no esté verificada puede tener hasta 3 ofertas abiertas a la vez
-- (pendientes o aceptadas sin pagar). La verificación pasa a ser un sello de confianza.

create or replace function public.validar_oferta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.perfiles;
begin
  select * into p from public.perfiles where id = new.comprador_id;
  if not found or p.rol <> 'usuario' then
    raise exception 'Esta cuenta no puede ofertar';
  end if;
  if not p.verificado and (
    select count(*) from public.ofertas where comprador_id = new.comprador_id and estado in ('pendiente', 'aceptada')
  ) >= 3 then
    raise exception 'Como cuenta nueva podés tener hasta 3 ofertas abiertas a la vez. Esperá la respuesta de alguna o cancelala';
  end if;
  if not exists (select 1 from public.lotes where id = new.lote_id and estado = 'publicado') then
    raise exception 'El lote no está disponible';
  end if;
  if exists (select 1 from public.lotes where id = new.lote_id and vendedor_id = new.comprador_id) then
    raise exception 'No podés ofertar por tu propio lote';
  end if;
  new.estado := 'pendiente';
  new.comision := null;
  new.pagada_at := null;
  new.completada_at := null;
  new.liquidada_at := null;
  new.comprobante := null;
  return new;
end;
$$;

-- Para mostrar "Vendedor verificado" en el lote solo cuando es cierto (lo puede
-- ver cualquiera; no expone ningún otro dato del perfil).
create or replace function public.vendedor_verificado(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select verificado from public.perfiles where id = p_usuario), false);
$$;
revoke execute on function public.vendedor_verificado(uuid) from public;
grant execute on function public.vendedor_verificado(uuid) to anon, authenticated;
