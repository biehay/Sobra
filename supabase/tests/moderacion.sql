-- Moderación automática: la base aplica lo que decidió el moderador (reglas + IA)
-- con sus propios controles. Se corre contra una base con las migraciones
-- aplicadas (ver README).
\set ON_ERROR_STOP 1
begin;

create function pg_temp.como(usuario uuid) returns void language plpgsql as $$
declare
  sesion uuid := md5(coalesce(usuario::text, '') || 'true')::uuid;
begin
  reset role;
  if usuario is not null then
    insert into sesiones_verificadas (session_id, user_id) values (sesion, usuario) on conflict do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(usuario::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', usuario, 'session_id', sesion)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.debe_fallar(sql text, motivo text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'NO FALLÓ: %', motivo;
exception
  when raise_exception then
    if sqlerrm like 'NO FALLÓ%' then raise; end if;
  when others then null;
end $$;

-- Lo que hace el servidor con la decisión del moderador.
create function pg_temp.moderar(lote uuid, resultado text, mensaje text default '') returns text language plpgsql as $$
declare r text;
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  r := moderar_lote(lote, resultado, '[{"tipo":"otro","detalle":"prueba"}]', mensaje);
  reset role;
  return r;
end $$;

-- Una empresa de confianza (verificada con CUIT), una persona que ya publicó y una que nunca publicó.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"nombre":"Empresa"}'),
  ('00000000-0000-0000-0000-0000000000e2', '{"nombre":"Ya publicó"}'),
  ('00000000-0000-0000-0000-0000000000e3', '{"nombre":"Nueva"}');
update perfiles set verificado = true, cuit = '30-71234567-8' where id = '00000000-0000-0000-0000-0000000000e1';

create function pg_temp.lote(id uuid, vendedor uuid, titulo text, cambios jsonb default '{}') returns void language plpgsql as $$
begin
  perform pg_temp.como(vendedor);
  insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, precio_lista, peso_kg, fotos, descripcion, estado)
  values (
    id, vendedor, titulo, 'Cerámicos y porcelanatos', 'nuevo', 'CABA',
    coalesce((cambios->>'precio_pedido')::numeric, 100), 200,
    case when cambios ? 'sin_peso' then null else 50 end,
    array[vendedor::text || '/a.jpg'],
    coalesce(cambios->>'descripcion', ''), 'en_revision'
  );
  insert into lote_retiro (lote_id, direccion) values (id, 'Calle 123');
  reset role;
end $$;

-- Un lote ya publicado (aprobado por el admin) para la persona e2.
select pg_temp.lote('30000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'Lote anterior');
select set_config('sobra.operacion', 'on', true);
update lotes set estado = 'publicado', precio_publicado = 100 where id = '30000000-0000-0000-0000-000000000000';
select set_config('sobra.operacion', 'off', true);

do $$ begin
  -- Aprobado y sin problemas: se publica al instante, al precio pedido.
  perform pg_temp.lote('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato 60x60');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000001', 'aprobado') = 'publicado', 'un lote aprobado no se publica';
  assert (select estado = 'publicado' and precio_publicado = 100 and publicado_automatico from lotes where id = '30000000-0000-0000-0000-000000000001'), 'no quedó publicado bien';
  assert (select aplicado = 'publicado' and resultado = 'aprobado' and motivos->0->>'tipo' = 'otro' from moderaciones where lote_id = '30000000-0000-0000-0000-000000000001'), 'no quedó el historial';

  -- Aunque la IA lo apruebe, los controles fijos de la base mandan.
  perform pg_temp.lote('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"descripcion":"Llamame al 11 2345 6789"}');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000002', 'aprobado') = 'contacto', 'deja pasar un teléfono';
  perform pg_temp.lote('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"precio_pedido":300}');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000003', 'aprobado') = 'precio', 'deja pasar un precio mayor al de lista';
  perform pg_temp.lote('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"sin_peso":true}');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000004', 'aprobado') = 'sin_peso', 'publica sin peso';
  assert (select estado = 'en_revision' from lotes where id = '30000000-0000-0000-0000-000000000004'), 'cambió el estado igual';

  -- Dudoso: queda en revisión. Rechazado: vuelve al vendedor con la explicación.
  perform pg_temp.lote('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', 'Cable de cobre usado');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000005', 'dudoso') = 'dudoso', 'un dudoso no queda en revisión';
  assert (select estado = 'en_revision' from lotes where id = '30000000-0000-0000-0000-000000000005'), 'un dudoso cambió de estado';
  perform pg_temp.lote('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e1', 'iPhone 13');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000006', 'rechazado', 'No es material de obra.') = 'rechazado', 'no rechaza';
  assert (select estado = 'rechazado' and nota_admin = 'No es material de obra.' from lotes where id = '30000000-0000-0000-0000-000000000006'), 'el rechazo no explica por qué';

  -- La primera publicación de alguien nuevo la mira una persona.
  perform pg_temp.lote('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e3', 'Porcelanato');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000007', 'aprobado') = 'primera_publicacion', 'la primera publicación sale sin revisar';

  -- Quien ya publicó antes: aprobado sale solo, hasta 3 por día.
  perform pg_temp.lote('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e2', 'Porcelanato A');
  perform pg_temp.lote('30000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000e2', 'Porcelanato B');
  perform pg_temp.lote('30000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000e2', 'Porcelanato C');
  perform pg_temp.lote('30000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000e2', 'Porcelanato D');
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000011', 'aprobado') = 'publicado', 'no publica a quien ya publicó';
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000012', 'aprobado') = 'publicado', 'no publica el segundo';
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000013', 'aprobado') = 'publicado', 'no publica el tercero';
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000014', 'aprobado') = 'limite_diario', 'no frena al cuarto del día';

  -- Solo aplica sobre lotes en revisión.
  assert pg_temp.moderar('30000000-0000-0000-0000-000000000001', 'rechazado') = 'no_en_revision', 'cambia un lote ya publicado';
end $$;

-- Ni el vendedor ni un visitante pueden aprobar un lote, ni ver las moderaciones.
select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
select pg_temp.debe_fallar($$select moderar_lote('30000000-0000-0000-0000-000000000007', 'aprobado', '[]', '')$$, 'el vendedor aprueba su propio lote');
select pg_temp.debe_fallar($$select controles_publicacion('30000000-0000-0000-0000-000000000007')$$, 'el vendedor llama a los controles');
do $$ begin assert (select count(*) = 0 from moderaciones), 'el vendedor ve las moderaciones'; end $$;
reset role;
set local role anon;
select pg_temp.debe_fallar($$select moderar_lote('30000000-0000-0000-0000-000000000007', 'aprobado', '[]', '')$$, 'un visitante aprueba un lote');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
