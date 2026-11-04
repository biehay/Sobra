-- Denuncias de publicaciones. Cualquier usuario con cuenta puede denunciar un lote
-- publicado (una vez por lote). Una denuncia nunca da de baja nada sola:
--   - Cada denuncia le llega al admin, que la revisa y decide: desestimar o dar de baja.
--   - Con denuncias abiertas de 3 personas distintas, el lote se pausa hasta que el admin lo revise.
--   - Si el admin ya las desestimó y el lote sigue juntando denuncias hasta llegar a 5
--     personas en total, se da de baja automáticamente.
-- Mientras haya denuncias abiertas, ni el vendedor puede reactivarlo ni la moderación
-- automática puede republicarlo.

create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  -- Si el lote se borra, la denuncia queda (con el título) como antecedente.
  lote_id uuid references public.lotes (id) on delete set null,
  titulo text not null,
  vendedor_id uuid references auth.users (id) on delete set null,
  autor_id uuid not null references auth.users (id) on delete cascade,
  motivo text not null check (motivo in ('no_es_material', 'robado', 'prohibido', 'enganoso', 'estafa', 'contacto', 'otro')),
  detalle text not null default '' check (char_length(detalle) <= 500),
  estado text not null default 'abierta' check (estado in ('abierta', 'baja', 'desestimada')),
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  unique (lote_id, autor_id)
);
create index denuncias_abiertas_idx on public.denuncias (lote_id) where estado = 'abierta';
create index denuncias_autor_idx on public.denuncias (autor_id, created_at desc);
alter table public.denuncias enable row level security;
revoke all on public.denuncias from anon, authenticated;
grant select on public.denuncias to authenticated;
-- Quien denuncia ve sus denuncias (para saber que ya denunció); el vendedor no ve quién lo denunció.
create policy "Cada uno ve sus denuncias" on public.denuncias for select to authenticated using (autor_id = auth.uid());
create policy "El admin ve las denuncias" on public.denuncias for select to authenticated using (public.es_admin());

alter table public.lotes add column if not exists pausado_por_denuncias boolean not null default false;

-- Un lote pausado por denuncias solo lo puede mover el admin (o las funciones de Sobrá).
create or replace function public.proteger_lote_denunciado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or public.es_admin() or current_setting('sobra.operacion', true) = 'on' then
    return new;
  end if;
  if old.pausado_por_denuncias or new.pausado_por_denuncias is distinct from old.pausado_por_denuncias then
    raise exception 'Este lote está en revisión por denuncias: te avisamos cuando lo revisemos';
  end if;
  return new;
end;
$$;
create trigger proteger_lote_denunciado before update on public.lotes
  for each row execute function public.proteger_lote_denunciado();

create or replace function public.denunciar_lote(p_lote uuid, p_motivo text, p_detalle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  l public.lotes;
  personas int;
  en_total int;
begin
  if yo is null then raise exception 'Ingresá a tu cuenta para denunciar'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if not found or l.estado not in ('publicado', 'reservado') then raise exception 'Esta publicación no se puede denunciar'; end if;
  if l.vendedor_id = yo then raise exception 'No podés denunciar tu propia publicación'; end if;
  if (select count(*) from public.denuncias where autor_id = yo and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Llegaste al límite de denuncias por hoy';
  end if;

  insert into public.denuncias (lote_id, titulo, vendedor_id, autor_id, motivo, detalle)
  values (p_lote, l.titulo, l.vendedor_id, yo, p_motivo, left(trim(coalesce(p_detalle, '')), 500))
  on conflict (lote_id, autor_id) do nothing;
  if not found then return 'ya_denunciada'; end if;

  -- Si tiene una operación en curso (reservado) no se toca: lo resuelve el admin.
  select count(*) filter (where estado = 'abierta'), count(*) into personas, en_total
    from public.denuncias where lote_id = p_lote;

  -- El admin ya lo revisó y lo dejó, pero lo siguen denunciando: con 5 personas en total, baja automática.
  if en_total >= 5 and l.estado = 'publicado'
     and exists (select 1 from public.denuncias where lote_id = p_lote and estado = 'desestimada') then
    perform set_config('sobra.operacion', 'on', true);
    update public.lotes
      set estado = 'rechazado', pausado_por_denuncias = false, publicado_automatico = false,
          nota_admin = 'Lo dimos de baja porque lo denunciaron ' || en_total || ' personas. Si creés que es un error, escribinos.'
      where id = p_lote;
    perform set_config('sobra.operacion', 'off', true);
    update public.denuncias set estado = 'baja', resuelta_at = now() where lote_id = p_lote and estado = 'abierta';
    return 'baja';
  end if;

  -- Con denuncias abiertas de 3 personas distintas, se pausa hasta que lo revise el admin.
  if personas >= 3 and l.estado = 'publicado' then
    perform set_config('sobra.operacion', 'on', true);
    update public.lotes
      set estado = 'pausado', pausado_por_denuncias = true,
          nota_admin = 'Lo pausamos porque varios usuarios lo denunciaron. Lo estamos revisando y te avisamos por email.'
      where id = p_lote;
    perform set_config('sobra.operacion', 'off', true);
    return 'pausado';
  end if;
  return 'denunciada';
end;
$$;

-- El admin resuelve todas las denuncias abiertas de un lote a la vez.
--   desestimar: no pasa nada; si estaba pausado por denuncias, vuelve a publicarse.
--   baja: el lote sale de la publicación y vuelve al vendedor con la nota.
create or replace function public.resolver_denuncias(p_lote uuid, p_decision text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  if p_decision not in ('desestimar', 'baja') then raise exception 'Decisión inválida'; end if;
  select * into l from public.lotes where id = p_lote for update;
  if not found then raise exception 'Lote inexistente'; end if;

  if p_decision = 'baja' then
    if nullif(trim(coalesce(p_nota, '')), '') is null then raise exception 'Escribí por qué se da de baja'; end if;
    if l.estado not in ('publicado', 'pausado', 'en_revision') then
      raise exception 'Tiene una operación en curso: resolvelo desde Operaciones';
    end if;
    update public.lotes set estado = 'rechazado', pausado_por_denuncias = false, nota_admin = trim(p_nota), publicado_automatico = false
      where id = p_lote;
  elsif l.pausado_por_denuncias then
    update public.lotes set estado = 'publicado', pausado_por_denuncias = false, nota_admin = null where id = p_lote;
  end if;

  update public.denuncias
    set estado = case when p_decision = 'baja' then 'baja' else 'desestimada' end, resuelta_at = now()
    where lote_id = p_lote and estado = 'abierta';
end;
$$;

revoke execute on function public.denunciar_lote(uuid, text, text) from public, anon;
grant execute on function public.denunciar_lote(uuid, text, text) to authenticated;
revoke execute on function public.resolver_denuncias(uuid, text, text) from public, anon;
grant execute on function public.resolver_denuncias(uuid, text, text) to authenticated;

-- La moderación automática no republica un lote con denuncias abiertas: lo mira una persona.
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
  elsif exists (select 1 from public.denuncias where lote_id = p_lote and estado = 'abierta') then
    aplicado := 'denuncias';
  else
    aplicado := public.controles_publicacion(p_lote);
    if aplicado = 'ok' and not public.vendedor_de_confianza(l.vendedor_id) then
      if not exists (select 1 from public.lotes where vendedor_id = l.vendedor_id and publicado_at is not null) then
        aplicado := 'primera_publicacion';
      else
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
