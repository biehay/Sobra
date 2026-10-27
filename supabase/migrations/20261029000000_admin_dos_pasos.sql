-- El admin solo tiene permisos de admin si su sesión pasó la verificación en
-- dos pasos (aal2 = contraseña + código de la app autenticadora). Con solo la
-- contraseña (aal1) la base lo trata como un usuario común, así que una
-- contraseña robada no alcanza para ver los datos de todos ni confirmar pagos.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;
