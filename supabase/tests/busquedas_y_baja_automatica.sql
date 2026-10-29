-- Búsquedas guardadas ("Lo busco") y baja automática de precio.
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
  ('00000000-0000-0000-0000-00000000000b', '{"nombre":"Marta"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nombre":"Juan"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"nombre":"Otra"}');
update perfiles set rol = 'admin', verificado = true where id = '00000000-0000-0000-0000-00000000000a';

-- Búsquedas: con el segundo paso, propias y privadas.
select pg_temp.como('00000000-0000-0000-0000-00000000000c', false);
select pg_temp.debe_fallar($$insert into busquedas (texto) values ('porcelanato')$$, 'guarda búsqueda sin dos pasos');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
insert into busquedas (id, texto, categoria, zona, precio_max) values
  ('30000000-0000-0000-0000-000000000001', 'Porcelanatos gris', 'Cerámicos y porcelanatos', 'GBA Sur', 500000),
  ('30000000-0000-0000-0000-000000000002', 'inodoro', null, null, null),
  ('30000000-0000-0000-0000-000000000003', 'porcelanato', null, null, 100000);
select pg_temp.debe_fallar($$insert into busquedas (usuario_id, texto) values ('00000000-0000-0000-0000-00000000000d', 'ajena')$$, 'búsqueda a nombre de otro');
select pg_temp.debe_fallar($$insert into busquedas (texto) values ('ab')$$, 'búsqueda demasiado corta');
select pg_temp.debe_fallar($$insert into busquedas (texto) select 'tope ' || g from generate_series(1, 8) g$$, 'más de 10 búsquedas activas');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from busquedas) = 0, 've búsquedas ajenas';
end $$;
-- La vendedora también busca porcelanato: no tiene que avisarse a sí misma.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into busquedas (texto) values ('porcelanato');

insert into lotes (id, vendedor_id, titulo, descripcion, categoria, condicion, zona, precio_pedido, estado)
values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Porcelanato 60x60 gris', 'Sin uso, en cajas', 'Cerámicos y porcelanatos', 'nuevo', 'GBA Sur', 500000, 'en_revision');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update lotes set estado = 'publicado', precio_publicado = 480000;

-- Al publicarse, el servidor registra las coincidencias (una sola vez).
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.debe_fallar($$select registrar_coincidencias('10000000-0000-0000-0000-000000000001')$$, 'un usuario registra coincidencias');
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
do $$ begin
  assert (select count(*) from registrar_coincidencias('10000000-0000-0000-0000-000000000001')) = 1, 'debería avisar solo a la búsqueda que coincide';
  assert (select count(*) from registrar_coincidencias('10000000-0000-0000-0000-000000000001')) = 0, 'avisa dos veces';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from busqueda_coincidencias) = 1, 'no ve su coincidencia';
  assert (select count(*) from lotes_para_busqueda('30000000-0000-0000-0000-000000000001')) = 1, 'no encuentra el lote publicado';
  assert (select count(*) from lotes_para_busqueda('30000000-0000-0000-0000-000000000003')) = 0, 'ignora el precio máximo';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from lotes_para_busqueda('30000000-0000-0000-0000-000000000001')) = 0, 'usa una búsqueda ajena';
  assert (select count(*) from busqueda_coincidencias) = 0, 've coincidencias ajenas';
end $$;
select pg_temp.como(null);
do $$ begin
  assert (select count(*) from busquedas_publicas()) >= 2, 'los vendedores no ven la demanda';
end $$;

-- Baja automática: una vez por semana, hasta el mínimo, y solo la corre el servidor.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
update lotes set baja_semanal_pct = 10;
insert into lote_precio_minimo values ('10000000-0000-0000-0000-000000000001', 400000);
-- El mínimo es privado: un comprador no lo puede leer.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from lote_precio_minimo) = 0, 'un comprador ve el precio mínimo';
end $$;
select pg_temp.debe_fallar($$insert into lote_precio_minimo values ('10000000-0000-0000-0000-000000000001', 1)$$, 'un tercero cambia el mínimo');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$select aplicar_bajas_de_precio()$$, 'el vendedor corre las bajas');
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
do $$ begin
  assert (select count(*) from aplicar_bajas_de_precio()) = 0, 'baja antes de la semana';
end $$;
update lotes set publicado_at = now() - interval '8 days';
do $$ begin
  assert (select precio_nuevo from aplicar_bajas_de_precio()) = 432000, 'no bajó el 10%';
  assert (select count(*) from aplicar_bajas_de_precio()) = 0, 'bajó dos veces la misma semana';
end $$;
update lotes set ultima_baja_at = now() - interval '8 days';
do $$ begin
  assert (select precio_nuevo from aplicar_bajas_de_precio()) = 400000, 'pasó del precio mínimo';
end $$;
update lotes set ultima_baja_at = now() - interval '8 days';
do $$ begin
  assert (select count(*) from aplicar_bajas_de_precio()) = 0, 'sigue bajando en el mínimo';
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
