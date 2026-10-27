-- Registro de la liquidación al vendedor: cuándo Sobrá le transfirió el monto
-- de una operación completada, descontada la comisión.
alter table public.ofertas add column liquidada_at timestamptz;

create function public.marcar_liquidada(p_oferta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  update public.ofertas
    set liquidada_at = now(), updated_at = now()
    where id = p_oferta and estado = 'completada' and liquidada_at is null;
  if not found then raise exception 'La operación no está completada o ya fue liquidada'; end if;
end;
$$;

revoke execute on function public.marcar_liquidada(uuid) from anon;
