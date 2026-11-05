-- Ofertar sin verificación del admin: una cuenta nueva puede tener hasta 3 ofertas
-- abiertas a la vez; verificada, sin tope. Se corre contra una base con las
-- migraciones aplicadas (ver README).
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

create function pg_temp.ofertar(comprador uuid, lote int) returns text language plpgsql as $$
begin
  perform pg_temp.como(comprador);
  insert into ofertas (lote_id, comprador_id, monto) values (('60000000-0000-0000-0000-00000000000' || lote)::uuid, comprador, 100);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end $$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', '{"nombre":"Vendedor"}'),
  ('00000000-0000-0000-0000-0000000000b2', '{"nombre":"Comprador nuevo"}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"nombre":"Comprador verificado"}');
update perfiles set verificado = true where id = '00000000-0000-0000-0000-0000000000b3';

select set_config('sobra.operacion', 'on', true);
insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, precio_publicado, estado)
select ('60000000-0000-0000-0000-00000000000' || i)::uuid, '00000000-0000-0000-0000-0000000000b1', 'Lote ' || i,
       'Cerámicos y porcelanatos', 'nuevo', 'CABA', 100, 100, 'publicado'
from generate_series(1, 5) i;
select set_config('sobra.operacion', 'off', true);

do $$ begin
  -- Cuenta nueva: 3 ofertas abiertas sí, la cuarta no.
  assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b2', 1) = 'ok', 'una cuenta nueva no puede ofertar';
  assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b2', 2) = 'ok', 'no deja la segunda oferta';
  assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b2', 3) = 'ok', 'no deja la tercera oferta';
  assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b2', 4) like '%hasta 3 ofertas abiertas%', 'una cuenta nueva pasa el tope de 3';
  -- Si una se cierra (rechazada), puede ofertar de nuevo.
  update ofertas set estado = 'rechazada' where comprador_id = '00000000-0000-0000-0000-0000000000b2' and lote_id = '60000000-0000-0000-0000-000000000001';
  assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b2', 4) = 'ok', 'con una oferta cerrada no puede volver a ofertar';
  -- Verificada: sin tope.
  for i in 1..5 loop
    assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b3', i) = 'ok', 'una cuenta verificada tiene tope';
  end loop;
  -- El vendedor no puede ofertar por lo suyo.
  assert pg_temp.ofertar('00000000-0000-0000-0000-0000000000b1', 5) like '%propio lote%', 'el vendedor oferta por su lote';
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
