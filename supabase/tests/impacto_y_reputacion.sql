-- Impacto ambiental, constancias y reputación.
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
  ('00000000-0000-0000-0000-00000000000b', '{"nombre":"Marta","empresa":"Constructora Sur"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nombre":"Juan Contratista"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"nombre":"Otra persona"}');
update perfiles set rol = 'admin', verificado = true where id = '00000000-0000-0000-0000-00000000000a';
update perfiles set verificado = true where id = '00000000-0000-0000-0000-00000000000c';
update perfiles set empresa = 'Constructora Sur' where id = '00000000-0000-0000-0000-00000000000b';

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, estado, peso_kg)
values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Porcelanato 60x60', 'Cerámicos y porcelanatos', 'nuevo', 'GBA Sur', 500000, 'en_revision', 1000);
select pg_temp.debe_fallar($$update lotes set peso_kg = -5$$, 'peso negativo');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update lotes set estado = 'publicado', precio_publicado = 480000;

-- Cambiar el peso de un lote publicado lo vuelve a revisión.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
update lotes set peso_kg = 5000;
do $$ begin
  assert (select estado from lotes) = 'en_revision', 'cambiar el peso no lo mandó a revisión';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update lotes set estado = 'publicado', peso_kg = 1000;

-- Operación completa.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
insert into ofertas (id, lote_id, comprador_id, monto, respondida_at)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', auth.uid(), 450000, now() - interval '9 days');
do $$ begin
  assert (select respondida_at from ofertas) is null, 'la oferta nace respondida';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select responder_oferta('20000000-0000-0000-0000-000000000001', true);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select confirmar_pago('20000000-0000-0000-0000-000000000001');
select completar_operacion('20000000-0000-0000-0000-000000000001');

-- Impacto: el vendedor recupera los kilos y el comprador evita el CO₂ (sin contar dos veces).
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select rol from mi_impacto()) = 'vendedor' and (select kg from mi_impacto()) = 1000 and (select co2 from mi_impacto()) = 0, 'impacto del vendedor';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select rol from mi_impacto()) = 'comprador' and (select co2 from mi_impacto()) = 780, 'impacto del comprador';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from mi_impacto()) = 0, 'un tercero ve impacto ajeno';
end $$;

-- Constancias: con el segundo paso, guardadas y verificables por cualquiera.
select pg_temp.como('00000000-0000-0000-0000-00000000000b', false);
select pg_temp.debe_fallar($$select emitir_constancia(extract(year from now())::int)$$, 'emite constancia sin dos pasos');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$select emitir_constancia(1999)$$, 'constancia de un año sin operaciones');
select pg_temp.debe_fallar($$insert into constancias values ('TRUCHA', auth.uid(), 2026, 999999, 0, 0, 1, now())$$, 'inventa una constancia');
select set_config('prueba.codigo', emitir_constancia(extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::int), true);
do $$ begin
  assert (select kg_recuperados from constancias) = 1000, 'la constancia no guardó los kilos';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from constancias) = 0, 'un tercero lista constancias ajenas';
end $$;
select pg_temp.como(null);
do $$ begin
  assert (select titular from verificar_constancia(lower(current_setting('prueba.codigo')))) = 'Constructora Sur', 'la verificación pública no encuentra la constancia';
  assert (select count(*) from verificar_constancia('NOEXISTE')) = 0, 'verifica un código inexistente';
  assert (select kg from impacto_total()) = 1000, 'impacto total de la plataforma';
end $$;

-- Reputación: hechos de las operaciones, visibles para cualquiera.
do $$ begin
  assert (select ventas from reputacion('00000000-0000-0000-0000-00000000000b')) = 1;
  assert (select ventas_ok from reputacion('00000000-0000-0000-0000-00000000000b')) = 1;
  assert (select horas_respuesta from reputacion('00000000-0000-0000-0000-00000000000b')) is not null, 'no midió la respuesta';
  assert (select compras_ok from reputacion('00000000-0000-0000-0000-00000000000c')) = 1;
  assert (select ventas from reputacion('00000000-0000-0000-0000-00000000000c')) = 0;
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$update ofertas set respondida_at = now() - interval '1 hour'$$, 'el vendedor maquilla su tiempo de respuesta');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
