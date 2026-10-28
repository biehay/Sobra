-- Prueba del código de retiro y de los reclamos.
-- Se corre igual que flujo_operacion.sql (ver README).
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

-- Prepara una operación paga: lote publicado, oferta aceptada y pago confirmado.
-- Devuelve el id de la oferta. Corre como postgres (sin usuario).
create function pg_temp.operacion_paga(n int) returns uuid language plpgsql as $$
declare
  lote uuid := gen_random_uuid();
  oferta uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub', '', true);
  insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, estado, precio_publicado)
  values (lote, '00000000-0000-0000-0000-00000000000b', 'Lote de prueba ' || n, 'Otros', 'nuevo', 'CABA', 1000, 'publicado', 1000);
  insert into ofertas (id, lote_id, comprador_id, monto) values (oferta, lote, '00000000-0000-0000-0000-00000000000c', 1000);
  perform pg_temp.como('00000000-0000-0000-0000-00000000000b');
  perform responder_oferta(oferta, true);
  perform pg_temp.como('00000000-0000-0000-0000-00000000000a');
  perform confirmar_pago(oferta);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return oferta;
end $$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"nombre":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"rol":"vendedor","nombre":"Vendedor"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"rol":"comprador","nombre":"Comprador"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"rol":"vendedor","nombre":"Otro vendedor"}');
update perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
update perfiles set verificado = true where id = '00000000-0000-0000-0000-00000000000c';

-- ---------------------------------------------------------------------------
-- 1. Retiro con código correcto
-- ---------------------------------------------------------------------------
create temp table ops (n int primary key, oferta uuid);
grant select on ops to authenticated, anon;
insert into ops values (1, pg_temp.operacion_paga(1));
do $$ begin
  assert (select codigo from codigos_retiro where oferta_id = (select oferta from ops where n = 1)) ~ '^[0-9]{6}$',
    'confirmar el pago genera un código de 6 dígitos';
end $$;

-- El vendedor no puede leer el código; el comprador sí.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from codigos_retiro) = 0, 'el vendedor ve el código de retiro';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from codigos_retiro) = 1, 'el comprador no ve su código';
end $$;
select pg_temp.debe_fallar($$select confirmar_retiro((select oferta from ops where n = 1), '000000')$$, 'el comprador confirma su propio retiro');

-- Otro vendedor no puede confirmar.
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.debe_fallar($$select confirmar_retiro((select oferta from ops where n = 1), '000000')$$, 'otro vendedor confirma el retiro');

-- Código incorrecto: devuelve false y no completa.
reset role;
create temp table codigo1 as select codigo from codigos_retiro where oferta_id = (select oferta from ops where n = 1);
grant select on codigo1 to authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ declare mal text; begin
  mal := lpad(((((select codigo from codigo1))::int + 1) % 1000000)::text, 6, '0');
  assert not confirmar_retiro((select oferta from ops where n = 1), mal), 'acepta un código incorrecto';
  assert (select estado from ofertas where id = (select oferta from ops where n = 1)) = 'pagada';
end $$;

-- Código correcto (con espacios, como lo dictaría alguien): completa y vende el lote.
do $$ begin
  assert confirmar_retiro((select oferta from ops where n = 1), ' ' || substr((select codigo from codigo1), 1, 3) || ' ' || substr((select codigo from codigo1), 4)),
    'rechaza el código correcto';
  assert (select estado from ofertas where id = (select oferta from ops where n = 1)) = 'completada';
  assert (select l.estado from lotes l join ofertas o on o.lote_id = l.id where o.id = (select oferta from ops where n = 1)) = 'vendido';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Bloqueo después de 5 intentos fallidos
-- ---------------------------------------------------------------------------
reset role;
insert into ops values (2, pg_temp.operacion_paga(2));
update codigos_retiro set codigo = '123456' where oferta_id = (select oferta from ops where n = 2);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  for i in 1..5 loop
    assert not confirmar_retiro((select oferta from ops where n = 2), '000000');
  end loop;
end $$;
select pg_temp.debe_fallar($$select confirmar_retiro((select oferta from ops where n = 2), '123456')$$, 'acepta el código después de 5 intentos fallidos');

-- ---------------------------------------------------------------------------
-- 3. Reclamo del comprador resuelto con devolución
-- ---------------------------------------------------------------------------
reset role;
insert into ops values (3, pg_temp.operacion_paga(3));
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.debe_fallar($$select abrir_reclamo((select oferta from ops where n = 3), 'otro', 'No soy parte de esta operación')$$, 'un tercero abre un reclamo');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select abrir_reclamo((select oferta from ops where n = 3), 'no_coincide', 'Los cerámicos están partidos, no es lo de las fotos');
select pg_temp.debe_fallar($$select abrir_reclamo((select oferta from ops where n = 3), 'otro', 'Segundo reclamo sobre lo mismo')$$, 'dos reclamos abiertos a la vez');

-- Con el reclamo abierto, el vendedor no puede cerrar la venta aunque tenga el código.
reset role;
create temp table codigo3 as select codigo from codigos_retiro where oferta_id = (select oferta from ops where n = 3);
grant select on codigo3 to authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$select confirmar_retiro((select oferta from ops where n = 3), (select codigo from codigo3))$$, 'completa con reclamo abierto');
do $$ begin
  assert (select count(*) from reclamos) = 1, 'el vendedor no ve el reclamo sobre su lote';
end $$;
select pg_temp.debe_fallar($$select resolver_reclamo((select id from reclamos limit 1), 'completar', 'Me lo resuelvo yo')$$, 'el vendedor resuelve el reclamo');

-- El admin sin dos pasos tampoco puede resolver.
select pg_temp.como('00000000-0000-0000-0000-00000000000a', false);
select pg_temp.debe_fallar($$select resolver_reclamo((select id from reclamos limit 1), 'devolver', 'x')$$, 'admin sin dos pasos resuelve');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_fallar($$select completar_operacion((select oferta from ops where n = 3))$$, 'admin completa con reclamo abierto');
select resolver_reclamo((select id from reclamos where estado = 'abierto'), 'devolver', 'Fotos confirman el daño: se devuelve el pago');
do $$ begin
  assert (select estado from ofertas where id = (select oferta from ops where n = 3)) = 'reembolsada';
  assert (select l.estado from lotes l join ofertas o on o.lote_id = l.id where o.id = (select oferta from ops where n = 3)) = 'pausado';
  assert (select count(*) from datos_operacion((select oferta from ops where n = 3))) = 0, 'datos visibles tras el reembolso';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reclamo del vendedor (no se presentó) resuelto completando la venta
-- ---------------------------------------------------------------------------
reset role;
insert into ops values (4, pg_temp.operacion_paga(4));
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select abrir_reclamo((select oferta from ops where n = 4), 'no_se_presento', 'Pasaron 10 días y no vino a retirar');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select resolver_reclamo((select id from reclamos where estado = 'abierto'), 'completar', 'Retiró el sábado, lo confirmó por WhatsApp');
do $$ begin
  assert (select estado from ofertas where id = (select oferta from ops where n = 4)) = 'completada';
end $$;

-- Nadie puede escribir directo en las tablas protegidas.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.debe_fallar($$update reclamos set estado = 'resuelto'$$, 'editar reclamos directo');
select pg_temp.debe_fallar($$insert into codigos_retiro values ((select oferta from ops where n = 1), '111111')$$, 'insertar códigos directo');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
