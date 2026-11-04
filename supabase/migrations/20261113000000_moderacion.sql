-- Moderación automática de publicaciones. Cada lote enviado a revisión pasa por
-- el moderador (reglas fijas + IA, en el servidor) y la base aplica la decisión:
--   - aprobado: se publica al instante si pasa los controles fijos y el vendedor
--     no está en su primera publicación ni pasó el límite diario.
--   - dudoso: queda en revisión manual, con los motivos para el admin.
--   - rechazado: vuelve al vendedor con una explicación.
-- Reemplaza a publicar_automatico (que solo publicaba a vendedores de confianza).

-- Historial de decisiones: qué dijo el moderador y por qué. Solo lo ve el admin.
create table public.moderaciones (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes (id) on delete cascade,
  resultado text not null check (resultado in ('aprobado', 'dudoso', 'rechazado')),
  -- [{ "tipo": "posible_robo", "detalle": "..." }]
  motivos jsonb not null default '[]',
  -- Qué hizo la base con la decisión: 'publicado', 'rechazado', 'dudoso', 'sin_fotos', 'primera_publicacion'...
  aplicado text not null,
  created_at timestamptz not null default now()
);
create index moderaciones_lote_idx on public.moderaciones (lote_id, created_at desc);
alter table public.moderaciones enable row level security;
revoke all on public.moderaciones from anon, authenticated;
grant select on public.moderaciones to authenticated;
create policy "El admin ve las moderaciones" on public.moderaciones for select to authenticated using (public.es_admin());

-- Controles fijos para publicar sin revisión manual. Devuelve 'ok' o el motivo.
create or replace function public.controles_publicacion(p_lote uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  texto text;
begin
  select * into l from public.lotes where id = p_lote;
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
  return 'ok';
end;
$$;

-- Aplica la decisión del moderador. Solo la llama el servidor (service_role):
-- ni el vendedor ni nadie desde el navegador puede aprobar su propio lote.
create or replace function public.moderar_lote(p_lote uuid, p_resultado text, p_motivos jsonb, p_mensaje text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  aplicado text;
  publicados_hoy int;
begin
  if p_resultado not in ('aprobado', 'dudoso', 'rechazado') then raise exception 'Resultado inválido'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if not found then raise exception 'Lote inexistente'; end if;

  if l.estado <> 'en_revision' then
    aplicado := 'no_en_revision';
  elsif p_resultado = 'rechazado' then
    perform set_config('sobra.operacion', 'on', true);
    update public.lotes
      set estado = 'rechazado', nota_admin = coalesce(nullif(trim(p_mensaje), ''), 'No cumple las reglas de publicación de Sobrá.')
      where id = p_lote;
    perform set_config('sobra.operacion', 'off', true);
    aplicado := 'rechazado';
  elsif p_resultado = 'dudoso' then
    aplicado := 'dudoso';
  else
    aplicado := public.controles_publicacion(p_lote);
    if aplicado = 'ok' and not public.vendedor_de_confianza(l.vendedor_id) then
      -- La primera publicación de cada vendedor la mira una persona.
      if not exists (select 1 from public.lotes where vendedor_id = l.vendedor_id and publicado_at is not null) then
        aplicado := 'primera_publicacion';
      else
        -- Una cuenta nueva no puede llenar el sitio de golpe: 3 automáticas por día.
        select count(*) into publicados_hoy from public.lotes
          where vendedor_id = l.vendedor_id and publicado_automatico and publicado_at > now() - interval '1 day';
        if publicados_hoy >= 3 then aplicado := 'limite_diario'; end if;
      end if;
    end if;
    if aplicado = 'ok' then
      perform set_config('sobra.operacion', 'on', true);
      update public.lotes
        set estado = 'publicado', precio_publicado = l.precio_pedido, nota_admin = null, publicado_automatico = true
        where id = p_lote;
      perform set_config('sobra.operacion', 'off', true);
      aplicado := 'publicado';
    end if;
  end if;

  insert into public.moderaciones (lote_id, resultado, motivos, aplicado)
  values (p_lote, p_resultado, coalesce(p_motivos, '[]'::jsonb), aplicado);
  return aplicado;
end;
$$;

revoke execute on function public.controles_publicacion(uuid) from public, anon, authenticated;
revoke execute on function public.moderar_lote(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.controles_publicacion(uuid) to service_role;
grant execute on function public.moderar_lote(uuid, text, jsonb, text) to service_role;

-- Ya no se usa: la reemplaza moderar_lote.
drop function if exists public.publicar_automatico(uuid);
