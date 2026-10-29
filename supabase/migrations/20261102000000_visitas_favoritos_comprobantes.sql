-- Visitas de cada lote, favoritos de los compradores y comprobantes de las
-- transferencias que Sobrá le hace al vendedor.

-- ---------------------------------------------------------------------------
-- Visitas
-- ---------------------------------------------------------------------------
-- Una fila por visitante y por día. "visitante" es un hash que arma el servidor
-- (con la fecha adentro, para que no se pueda seguir a nadie de un día a otro):
-- nunca se guarda la IP ni quién es. Solo las registra el servidor.
create table public.visitas_lote (
  lote_id uuid not null references public.lotes (id) on delete cascade,
  visitante text not null,
  dia date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  primary key (lote_id, dia, visitante)
);

alter table public.visitas_lote enable row level security;
create policy "el vendedor ve las visitas de sus lotes" on public.visitas_lote
  for select using (
    exists (select 1 from public.lotes l where l.id = lote_id and l.vendedor_id = auth.uid())
    or public.es_admin()
  );
revoke insert, update, delete on public.visitas_lote from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Favoritos
-- ---------------------------------------------------------------------------
-- Lleva un id propio: si la clave fuera (usuario_id, lote_id), la API de Supabase
-- la tomaría como tabla de unión entre perfiles y lotes y las consultas que
-- cruzan lotes con su vendedor quedarían ambiguas.
create table public.favoritos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  lote_id uuid not null references public.lotes (id) on delete cascade,
  -- Precio del lote al guardarlo, para avisar si baja.
  precio_guardado numeric(14, 2),
  -- Último precio por el que ya se avisó (para no repetir el aviso).
  precio_avisado numeric(14, 2),
  created_at timestamptz not null default now(),
  unique (usuario_id, lote_id)
);

alter table public.favoritos enable row level security;
create policy "favoritos propios" on public.favoritos
  for select using (usuario_id = auth.uid());
create policy "guardar favorito propio" on public.favoritos
  for insert with check (usuario_id = auth.uid());
create policy "quitar favorito propio" on public.favoritos
  for delete using (usuario_id = auth.uid());
revoke update on public.favoritos from anon, authenticated;

create function public.preparar_favorito()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
begin
  select * into l from public.lotes where id = new.lote_id;
  if not found or l.estado not in ('publicado', 'reservado') then
    raise exception 'Solo podés guardar lotes publicados';
  end if;
  if l.vendedor_id = new.usuario_id then raise exception 'No podés guardar tu propio lote'; end if;
  new.precio_guardado := l.precio_publicado;
  new.precio_avisado := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger preparar_favorito before insert on public.favoritos
  for each row execute function public.preparar_favorito();
create trigger a_exigir_dos_pasos before insert or delete on public.favoritos
  for each row execute function public.exigir_dos_pasos();

-- ---------------------------------------------------------------------------
-- Comprobantes de transferencia al vendedor
-- ---------------------------------------------------------------------------
-- Ruta del archivo en el bucket privado "comprobantes": <vendedor_id>/<archivo>.
alter table public.ofertas add column comprobante text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy "el admin sube comprobantes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.es_admin());
create policy "el admin borra comprobantes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin());
-- Cada vendedor ve solo los comprobantes de su carpeta.
create policy "ver comprobantes propios" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

-- Revisa que el comprobante esté en la carpeta del vendedor de esa operación.
create function public.validar_comprobante(p_oferta uuid, p_comprobante text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_comprobante is null then return; end if;
  if not exists (
    select 1 from public.ofertas o join public.lotes l on l.id = o.lote_id
    where o.id = p_oferta and p_comprobante like l.vendedor_id::text || '/%'
  ) then
    raise exception 'El comprobante no corresponde a esta operación';
  end if;
end;
$$;

drop function public.marcar_liquidada(uuid);
create function public.marcar_liquidada(p_oferta uuid, p_comprobante text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  perform public.validar_comprobante(p_oferta, p_comprobante);
  update public.ofertas
    set liquidada_at = now(), comprobante = p_comprobante, updated_at = now()
    where id = p_oferta and estado = 'completada' and liquidada_at is null;
  if not found then raise exception 'La operación no está completada o ya fue liquidada'; end if;
end;
$$;

-- Para sumar (o cambiar) el comprobante de una transferencia ya registrada.
create function public.adjuntar_comprobante(p_oferta uuid, p_comprobante text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  if p_comprobante is null then raise exception 'Falta el comprobante'; end if;
  perform public.validar_comprobante(p_oferta, p_comprobante);
  update public.ofertas set comprobante = p_comprobante, updated_at = now()
    where id = p_oferta and liquidada_at is not null;
  if not found then raise exception 'Primero registrá la transferencia'; end if;
end;
$$;

revoke execute on function public.marcar_liquidada(uuid, text), public.adjuntar_comprobante(uuid, text),
  public.validar_comprobante(uuid, text) from anon;

-- Una oferta nueva no puede venir con datos de liquidación ya cargados.
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
  new.liquidada_at := null;
  new.comprobante := null;
  return new;
end;
$$;

-- Visitas de los lotes del usuario: últimos 7 días (con hoy) y total. Corre con
-- los permisos de quien la llama, así que cada vendedor ve solo las suyas.
create function public.visitas_de_mis_lotes()
returns table (lote_id uuid, semana bigint, total bigint)
language sql
stable
set search_path = ''
as $$
  select v.lote_id,
         count(*) filter (where v.dia > (now() at time zone 'America/Argentina/Buenos_Aires')::date - 7),
         count(*)
  from public.visitas_lote v
  join public.lotes l on l.id = v.lote_id
  where l.vendedor_id = auth.uid()
  group by v.lote_id;
$$;

revoke execute on function public.visitas_de_mis_lotes() from anon;
