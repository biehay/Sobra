-- Denuncias: una por persona y lote, pausa automática con 3 personas, el vendedor
-- no puede reactivarlo y el admin desestima o da de baja. Se corre contra una base
-- con las migraciones aplicadas (ver README).
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

create function pg_temp.denunciar(quien uuid, lote uuid) returns text language plpgsql as $$
declare r text;
begin
  perform pg_temp.como(quien);
  r := denunciar_lote(lote, 'robado', 'Tiene el logo de una empresa');
  reset role;
  return r;
end $$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', '{"nombre":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000d1', '{"nombre":"Vendedor"}'),
  ('00000000-0000-0000-0000-0000000000d2', '{"nombre":"Uno"}'),
  ('00000000-0000-0000-0000-0000000000d3', '{"nombre":"Dos"}'),
  ('00000000-0000-0000-0000-0000000000d4', '{"nombre":"Tres"}'),
  ('00000000-0000-0000-0000-0000000000d5', '{"nombre":"Cuatro"}'),
  ('00000000-0000-0000-0000-0000000000d6', '{"nombre":"Cinco"}');
update perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a0';

-- Dos lotes publicados del mismo vendedor.
select set_config('sobra.operacion', 'on', true);
insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, precio_publicado, peso_kg, fotos, estado) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Bobina de fibra', 'Fibra óptica y telecomunicaciones', 'nuevo', 'CABA', 100, 100, 50, '{x.jpg}', 'publicado'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'Porcelanato', 'Cerámicos y porcelanatos', 'nuevo', 'CABA', 100, 100, 50, '{x.jpg}', 'publicado');
select set_config('sobra.operacion', 'off', true);

do $$ begin
  -- Una denuncia por persona y lote; la segunda vez no suma.
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-000000000001') = 'denunciada', 'no registra la denuncia';
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-000000000001') = 'ya_denunciada', 'deja denunciar dos veces';
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d3', '40000000-0000-0000-0000-000000000001') = 'denunciada', 'no registra la segunda persona';
  assert (select estado = 'publicado' from lotes where id = '40000000-0000-0000-0000-000000000001'), 'pausa con 2 personas';
  -- La tercera persona lo pausa.
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d4', '40000000-0000-0000-0000-000000000001') = 'pausado', 'no pausa con 3 personas';
  assert (select estado = 'pausado' and pausado_por_denuncias and nota_admin like '%denunciaron%' from lotes where id = '40000000-0000-0000-0000-000000000001'), 'no quedó pausado por denuncias';
end $$;

-- El vendedor no puede denunciarse, ni reactivar el lote pausado, ni ver quién lo denunció.
select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select pg_temp.debe_fallar($$select denunciar_lote('40000000-0000-0000-0000-000000000002', 'otro', '')$$, 'el vendedor se denuncia');
select pg_temp.debe_fallar($$update lotes set estado = 'en_revision' where id = '40000000-0000-0000-0000-000000000001'$$, 'el vendedor reactiva un lote denunciado');
do $$ begin assert (select count(*) = 0 from denuncias), 'el vendedor ve las denuncias'; end $$;
-- Ni resolverlas.
select pg_temp.debe_fallar($$select resolver_denuncias('40000000-0000-0000-0000-000000000001', 'desestimar', '')$$, 'el vendedor resuelve denuncias');
-- Quien denunció ve solo la suya.
select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
do $$ begin assert (select count(*) = 1 from denuncias), 'quien denuncia no ve (solo) la suya'; end $$;
-- Un lote pausado ya no se puede denunciar; un visitante sin cuenta, nunca.
select pg_temp.debe_fallar($$select denunciar_lote('40000000-0000-0000-0000-000000000001', 'otro', '')$$, 'denuncia un lote pausado');
reset role;
set local role anon;
select pg_temp.debe_fallar($$select denunciar_lote('40000000-0000-0000-0000-000000000002', 'otro', '')$$, 'un visitante denuncia');

-- El admin desestima: vuelve a estar publicado y las denuncias quedan cerradas.
select pg_temp.como('00000000-0000-0000-0000-0000000000a0');
select resolver_denuncias('40000000-0000-0000-0000-000000000001', 'desestimar', '');
do $$ begin
  assert (select estado = 'publicado' and not pausado_por_denuncias and nota_admin is null from lotes where id = '40000000-0000-0000-0000-000000000001'), 'desestimar no lo republica';
  assert (select bool_and(estado = 'desestimada') from denuncias where lote_id = '40000000-0000-0000-0000-000000000001'), 'las denuncias siguen abiertas';
end $$;

-- El admin lo dejó publicado, pero lo siguen denunciando: con 5 personas en total, baja automática.
do $$ begin
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-000000000001') = 'ya_denunciada', 'una misma persona vuelve a sumar';
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d5', '40000000-0000-0000-0000-000000000001') = 'denunciada', 'con 4 en total no debería pasar nada';
  assert (select estado = 'publicado' from lotes where id = '40000000-0000-0000-0000-000000000001'), 'con 4 en total cambió el estado';
  assert pg_temp.denunciar('00000000-0000-0000-0000-0000000000d6', '40000000-0000-0000-0000-000000000001') = 'baja', 'con 5 en total no se da de baja';
  assert (select estado = 'rechazado' and not pausado_por_denuncias and nota_admin like '%5 personas%' from lotes where id = '40000000-0000-0000-0000-000000000001'), 'la baja automática no quedó bien';
  assert (select count(*) = 2 from denuncias where lote_id = '40000000-0000-0000-0000-000000000001' and estado = 'baja'), 'las denuncias nuevas no quedaron resueltas';
end $$;

-- Dar de baja pide el motivo y devuelve el lote al vendedor.
select pg_temp.denunciar('00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-000000000002');
select pg_temp.como('00000000-0000-0000-0000-0000000000a0');
select pg_temp.debe_fallar($$select resolver_denuncias('40000000-0000-0000-0000-000000000002', 'baja', '')$$, 'da de baja sin motivo');
select resolver_denuncias('40000000-0000-0000-0000-000000000002', 'baja', 'Es material de una empresa de servicios.');
do $$ begin
  assert (select estado = 'rechazado' and nota_admin = 'Es material de una empresa de servicios.' from lotes where id = '40000000-0000-0000-0000-000000000002'), 'no lo dio de baja';
  assert (select estado = 'baja' from denuncias where lote_id = '40000000-0000-0000-0000-000000000002'), 'la denuncia no quedó resuelta';
end $$;

-- Con denuncias abiertas, la moderación automática no lo republica.
reset role;
select set_config('sobra.operacion', 'on', true);
update lotes set estado = 'publicado' where id = '40000000-0000-0000-0000-000000000002';
select set_config('sobra.operacion', 'off', true);
select pg_temp.denunciar('00000000-0000-0000-0000-0000000000d3', '40000000-0000-0000-0000-000000000002');
select set_config('sobra.operacion', 'on', true);
update lotes set estado = 'en_revision' where id = '40000000-0000-0000-0000-000000000002';
select set_config('sobra.operacion', 'off', true);
set local role service_role;
do $$ begin
  assert moderar_lote('40000000-0000-0000-0000-000000000002', 'aprobado', '[]', '') = 'denuncias', 'la moderación republica un lote denunciado';
end $$;
reset role;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
