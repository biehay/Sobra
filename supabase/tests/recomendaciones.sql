-- Recomendaciones: historial de vistas y señales colectivas agregadas.
-- Se corre contra una base con la migración aplicada (ver README).
-- Cada bloque "debe fallar" verifica que la regla de seguridad bloquee la acción.
\set ON_ERROR_STOP 1
begin;

-- Simula la sesión de un usuario. Por defecto la sesión ya ingresó el código
-- del email (verificada); con segura = false, solo la contraseña.
create function pg_temp.como(usuario uuid, segura boolean default true) returns void language plpgsql as $$
declare
  sesion uuid := md5(coalesce(usuario::text, '') || segura::text)::uuid;
begin
  reset role;
  if usuario is not null and segura then
    insert into sesiones_verificadas (session_id, user_id) values (sesion, usuario) on conflict do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(usuario::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', usuario, 'session_id', sesion)::text, true);
  if usuario is null then
    execute 'set local role anon';
  else
    execute 'set local role authenticated';
  end if;
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

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nombre":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"nombre":"Vendedora"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nombre":"C"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"nombre":"D"}'),
  ('00000000-0000-0000-0000-00000000000e', '{"nombre":"E"}');
update perfiles set rol = 'admin', verificado = true where id = '00000000-0000-0000-0000-00000000000a';

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, estado) values
  ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Porcelanato 60x60', 'Cerámicos y porcelanatos', 'nuevo', 'CABA', 100, 'en_revision'),
  ('10000000-0000-0000-0000-000000000002', auth.uid(), 'Pegamento porcelanato', 'Cemento, cal y áridos', 'nuevo', 'CABA', 100, 'en_revision'),
  ('10000000-0000-0000-0000-000000000003', auth.uid(), 'Cable 2,5 mm', 'Electricidad e iluminación', 'nuevo', 'CABA', 100, 'en_revision'),
  ('10000000-0000-0000-0000-000000000004', auth.uid(), 'Borrador sin publicar', 'Otros', 'nuevo', 'CABA', 100, 'borrador');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update lotes set estado = 'publicado', precio_publicado = 100 where estado = 'en_revision';

-- La vendedora no suma vistas a sus propios lotes, nadie a uno sin publicar.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select registrar_vista('10000000-0000-0000-0000-000000000001');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select registrar_vista('10000000-0000-0000-0000-000000000004');
select pg_temp.debe_fallar($$insert into vistas_usuario (usuario_id, lote_id) values (auth.uid(), '10000000-0000-0000-0000-000000000003')$$, 'un usuario escribe su historial a mano');
select registrar_vista('10000000-0000-0000-0000-000000000001');
select registrar_vista('10000000-0000-0000-0000-000000000001');
select registrar_vista('10000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from vistas_usuario) = 2, 'cuenta vistas que no corresponden';
  assert (select veces from vistas_usuario where lote_id = '10000000-0000-0000-0000-000000000001') = 2, 'no suma la segunda vista del día';
end $$;
select pg_temp.como(null);
select pg_temp.debe_fallar($$select registrar_vista('10000000-0000-0000-0000-000000000001')$$, 'un visitante registra vistas en la base');

select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select registrar_vista('10000000-0000-0000-0000-000000000001');
select registrar_vista('10000000-0000-0000-0000-000000000002');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select registrar_vista('10000000-0000-0000-0000-000000000001');
select registrar_vista('10000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from vistas_usuario) = 2, 've el historial de otros';
end $$;

-- Señales colectivas: solo con al menos 2 personas en común (sin contar a quien pregunta).
select pg_temp.como(null);
do $$ begin
  assert (select en_comun from senales_colectivas(array['10000000-0000-0000-0000-000000000001'::uuid], null)
          where lote_id = '10000000-0000-0000-0000-000000000002') = 2, 'no ve que C y D vieron los dos';
  assert not exists (select 1 from senales_colectivas(array['10000000-0000-0000-0000-000000000001'::uuid], null)
          where lote_id = '10000000-0000-0000-0000-000000000003'), 'revela lo que vio una sola persona';
  assert (select count(*) from senales_colectivas(array['10000000-0000-0000-0000-000000000001'::uuid], '00000000-0000-0000-0000-00000000000c')) = 0,
    'cuenta a la propia persona como "otros"';
  assert (select personas from popularidad_lotes() where lote_id = '10000000-0000-0000-0000-000000000001') = 3, 'popularidad mal contada';
end $$;

-- Origen de la visita: se guarda solo si tiene el formato de una recomendación.
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select registrar_vista('10000000-0000-0000-0000-000000000002', 'rec-complemento');
do $$ begin
  assert (select origen from vistas_usuario where lote_id = '10000000-0000-0000-0000-000000000002') = 'rec-complemento', 'no guardó el origen';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select registrar_vista('10000000-0000-0000-0000-000000000003', 'cualquier cosa; drop table lotes');
do $$ begin
  assert (select origen from vistas_usuario where lote_id = '10000000-0000-0000-0000-000000000003') is null, 'guardó un origen inválido';
end $$;

-- Las métricas de recomendaciones son solo para el admin.
select pg_temp.debe_fallar($$select * from metricas_recomendaciones()$$, 'un usuario ve las métricas');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select visitas from metricas_recomendaciones() where origen = 'rec-complemento') = 1, 'métricas mal contadas';
  assert (select sum(visitas) from metricas_recomendaciones()) = 8, 'no cuenta las visitas directas';
end $$;

-- Fichas técnicas: se ven las de lotes visibles y solo las escribe el servidor.
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
insert into fichas_lote (lote_id, ficha, modelo) values
  ('10000000-0000-0000-0000-000000000001', '{"material":"porcelanato"}', 'prueba'),
  ('10000000-0000-0000-0000-000000000004', '{"material":"borrador"}', 'prueba');
select pg_temp.como(null);
do $$ begin
  assert (select count(*) from fichas_lote) = 1, 'un visitante ve la ficha de un lote sin publicar';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from fichas_lote) = 2, 'la vendedora no ve la ficha de su borrador';
end $$;
select pg_temp.debe_fallar($$update fichas_lote set ficha = '{}'$$, 'un usuario cambia una ficha');
select pg_temp.debe_fallar($$insert into fichas_lote values ('10000000-0000-0000-0000-000000000003', '{}', 'x', now())$$, 'un usuario inventa una ficha');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
