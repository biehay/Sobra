-- Una sola cuenta para comprar y vender.
--
-- Antes había dos roles (vendedor y comprador) y había que registrarse dos
-- veces para hacer las dos cosas. Ahora todos los usuarios son "usuario" y
-- pueden publicar lotes y ofertar; el admin sigue aparte.
-- - Publicar: cualquier usuario (cada lote igual lo revisa el admin).
-- - Ofertar: hace falta que el admin haya verificado la cuenta.
-- - Nadie puede ofertar por su propio lote.

-- La política de lotes depende de la columna rol: hay que sacarla para cambiar el tipo.
drop policy "vendedor crea sus lotes" on public.lotes;

alter table public.perfiles alter column rol drop default;
alter type public.rol rename to rol_anterior;
create type public.rol as enum ('usuario', 'admin');
alter table public.perfiles
  alter column rol type public.rol
  using (case when rol::text = 'admin' then 'admin' else 'usuario' end)::public.rol;
alter table public.perfiles alter column rol set default 'usuario';
drop type public.rol_anterior;

-- Al registrarse, todos quedan como usuario (los admins se asignan a mano).
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, rol, nombre, empresa, cuit, telefono, zona)
  values (
    new.id,
    'usuario',
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    nullif(new.raw_user_meta_data ->> 'empresa', ''),
    nullif(new.raw_user_meta_data ->> 'cuit', ''),
    new.raw_user_meta_data ->> 'telefono',
    new.raw_user_meta_data ->> 'zona'
  );
  return new;
end;
$$;

create policy "usuario crea sus lotes" on public.lotes
  for insert with check (
    vendedor_id = auth.uid()
    and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'usuario')
  );

create or replace function public.validar_oferta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.perfiles
    where id = new.comprador_id and rol = 'usuario' and verificado
  ) then
    raise exception 'Tu cuenta todavía no está verificada para comprar';
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
  return new;
end;
$$;
