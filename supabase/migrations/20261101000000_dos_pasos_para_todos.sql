-- Verificación en dos pasos por email, obligatoria para todas las cuentas.
--
-- Al registrarse o ingresar, la app manda un código de 6 dígitos al email de
-- la cuenta. Recién cuando se ingresa el código, esa sesión queda "verificada"
-- y puede operar: publicar o editar lotes, ofertar, aceptar, confirmar retiros,
-- abrir reclamos, editar el perfil o subir fotos. Con la contraseña sola se
-- puede mirar lo propio, pero no operar. El admin también necesita una sesión
-- verificada para tener permisos de admin.
--
-- Supabase identifica cada sesión con el dato session_id del token: la
-- verificación vale para esa sesión (ese navegador) durante 30 días.

-- Sesiones que ya ingresaron el código. Solo las escribe la función de abajo.
create table public.sesiones_verificadas (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  verificada_at timestamptz not null default now()
);

-- Códigos enviados por email. Se guarda solo un hash: el código en claro viaja
-- únicamente en el email. Los crea el servidor de la app con la service role.
create table public.codigos_acceso (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  hash text not null,
  expira_at timestamptz not null,
  intentos int not null default 0,
  created_at timestamptz not null default now()
);
create index codigos_acceso_usuario_idx on public.codigos_acceso (user_id, created_at desc);

-- Sin políticas: ningún usuario las lee ni las escribe por la API.
alter table public.sesiones_verificadas enable row level security;
alter table public.codigos_acceso enable row level security;
revoke all on public.sesiones_verificadas, public.codigos_acceso from anon, authenticated;

create function public.sesion_actual()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

create function public.sesion_segura()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sesiones_verificadas
    where session_id = public.sesion_actual()
      and user_id = auth.uid()
      and verificada_at > now() - interval '30 days'
  );
$$;

-- El admin solo tiene permisos de admin con la sesión verificada.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sesion_segura()
     and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- El usuario ingresa el código que le llegó por email. Después de 5 intentos
-- fallidos o 10 minutos hay que pedir otro.
create function public.verificar_codigo_acceso(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.codigos_acceso;
  sesion uuid := public.sesion_actual();
begin
  if auth.uid() is null or sesion is null then raise exception 'Sesión inválida: volvé a ingresar'; end if;

  select * into c from public.codigos_acceso
    where user_id = auth.uid() and session_id = sesion
    order by created_at desc limit 1
    for update;
  if not found or c.expira_at < now() then raise exception 'El código venció. Pedí uno nuevo.'; end if;
  if c.intentos >= 5 then raise exception 'Demasiados intentos. Pedí un código nuevo.'; end if;

  if c.hash <> encode(sha256(convert_to(c.id::text || regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'), 'UTF8')), 'hex') then
    -- Se devuelve false en vez de fallar para que el intento quede registrado.
    update public.codigos_acceso set intentos = intentos + 1 where id = c.id;
    return false;
  end if;

  insert into public.sesiones_verificadas (session_id, user_id) values (sesion, auth.uid())
    on conflict (session_id) do update set verificada_at = now();
  delete from public.codigos_acceso where user_id = auth.uid();
  return true;
end;
$$;

revoke execute on function public.verificar_codigo_acceso(text) from anon;

-- Cualquier cambio que haga un usuario exige la sesión verificada. Los cambios
-- sin usuario (panel de Supabase, service role) no se ven afectados.
create function public.exigir_dos_pasos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.sesion_segura() then
    raise exception 'Ingresá el código que te enviamos por email para operar en Sobrá';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- El nombre empieza con "a_" para que corra antes que los demás triggers.
create trigger a_exigir_dos_pasos before insert or update or delete on public.lotes
  for each row execute function public.exigir_dos_pasos();
create trigger a_exigir_dos_pasos before insert or update or delete on public.lote_retiro
  for each row execute function public.exigir_dos_pasos();
create trigger a_exigir_dos_pasos before insert or update or delete on public.ofertas
  for each row execute function public.exigir_dos_pasos();
create trigger a_exigir_dos_pasos before insert or update or delete on public.reclamos
  for each row execute function public.exigir_dos_pasos();
create trigger a_exigir_dos_pasos before update or delete on public.codigos_retiro
  for each row execute function public.exigir_dos_pasos();
-- En perfiles solo cambios: el perfil se crea al registrarse, antes del código.
create trigger a_exigir_dos_pasos before update or delete on public.perfiles
  for each row execute function public.exigir_dos_pasos();

-- Las fotos se suben directo al almacenamiento: se exige lo mismo en sus permisos.
drop policy "subir fotos en carpeta propia" on storage.objects;
create policy "subir fotos en carpeta propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lotes' and (storage.foldername(name))[1] = auth.uid()::text and public.sesion_segura());
drop policy "borrar fotos propias" on storage.objects;
create policy "borrar fotos propias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lotes' and (storage.foldername(name))[1] = auth.uid()::text and public.sesion_segura());
