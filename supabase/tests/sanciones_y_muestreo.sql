-- Faltas y sanciones escalonadas, y muestreo de la moderación. Se corre contra una
-- base con las migraciones aplicadas (ver README).
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

create function pg_temp.falta(n int) returns void language plpgsql as $$
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000a0');
  for i in 1..n loop
    perform sumar_falta('00000000-0000-0000-0000-0000000000f1', null, 'manual', 'Prueba ' || i);
  end loop;
  reset role;
end $$;

create function pg_temp.lote_en_revision(id uuid) returns void language plpgsql as $$
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000f1');
  insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, precio_lista, peso_kg, fotos, estado)
  values (id, '00000000-0000-0000-0000-0000000000f1', 'Porcelanato', 'Cerámicos y porcelanatos', 'nuevo', 'CABA', 100, 200, 50, '{x.jpg}', 'en_revision');
  insert into lote_retiro (lote_id, direccion) values (id, 'Calle 123');
  reset role;
end $$;

create function pg_temp.moderar(lote uuid) returns text language plpgsql as $$
declare r text;
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;
  r := moderar_lote(lote, 'aprobado', '[]', '');
  reset role;
  return r;
end $$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', '{"nombre":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000f1', '{"nombre":"Empresa"}');
update perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a0';
update perfiles set verificado = true, cuit = '30-71234567-8' where id = '00000000-0000-0000-0000-0000000000f1';

do $$ begin
  -- Sin faltas: es de confianza y lo aprobado se publica. Con muestreo al 100%, queda para controlar.
  assert vendedor_de_confianza('00000000-0000-0000-0000-0000000000f1'), 'una empresa verificada sin faltas no es de confianza';
  perform set_config('sobra.muestreo', '1', true);
  perform pg_temp.lote_en_revision('50000000-0000-0000-0000-000000000001');
  assert pg_temp.moderar('50000000-0000-0000-0000-000000000001') = 'publicado', 'no publica sin faltas';
  assert (select muestreo from moderaciones where lote_id = '50000000-0000-0000-0000-000000000001'), 'no queda en el muestreo';
  perform set_config('sobra.muestreo', '0', true);
  perform pg_temp.lote_en_revision('50000000-0000-0000-0000-000000000002');
  assert pg_temp.moderar('50000000-0000-0000-0000-000000000002') = 'publicado', 'no publica el segundo';
  assert (select not muestreo from moderaciones where lote_id = '50000000-0000-0000-0000-000000000002'), 'entra al muestreo con proporción 0';

  -- 1 falta: advertencia, deja de ser de confianza (pero sigue publicando al instante).
  perform pg_temp.falta(1);
  assert faltas_activas('00000000-0000-0000-0000-0000000000f1') = 1, 'no cuenta la falta';
  assert not vendedor_de_confianza('00000000-0000-0000-0000-0000000000f1'), 'con una falta sigue siendo de confianza';
  perform pg_temp.lote_en_revision('50000000-0000-0000-0000-000000000003');
  assert pg_temp.moderar('50000000-0000-0000-0000-000000000003') = 'publicado', 'con una falta deja de publicar al instante (y debería seguir)';

  -- 2 faltas: todo a revisión manual.
  perform pg_temp.falta(1);
  perform pg_temp.lote_en_revision('50000000-0000-0000-0000-000000000004');
  assert pg_temp.moderar('50000000-0000-0000-0000-000000000004') = 'faltas', 'con 2 faltas publica al instante';
  assert suspendido_hasta('00000000-0000-0000-0000-0000000000f1') is null, 'con 2 faltas está suspendido';

  -- 3 faltas: 30 días sin publicar (los borradores sí).
  perform pg_temp.falta(1);
  assert suspendido_hasta('00000000-0000-0000-0000-0000000000f1') between now() + interval '29 days' and now() + interval '31 days', 'con 3 faltas no son 30 días';
end $$;

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar($$insert into lotes (vendedor_id, titulo, categoria, condicion, zona, precio_pedido, estado) values ('00000000-0000-0000-0000-0000000000f1', 'Porcelanato', 'Cerámicos y porcelanatos', 'nuevo', 'CABA', 100, 'en_revision')$$, 'publica estando suspendido');
insert into lotes (vendedor_id, titulo, categoria, condicion, zona, precio_pedido, estado) values ('00000000-0000-0000-0000-0000000000f1', 'Borrador', 'Cerámicos y porcelanatos', 'nuevo', 'CABA', 100, 'borrador');
-- El vendedor ve sus faltas, pero no puede sumar ni anular.
do $$ begin assert (select count(*) = 3 from faltas), 'el vendedor no ve sus faltas'; end $$;
select pg_temp.debe_fallar($$select sumar_falta('00000000-0000-0000-0000-0000000000a0', null, 'manual', 'x')$$, 'un usuario suma faltas');
select pg_temp.debe_fallar($$select anular_falta((select id from faltas limit 1))$$, 'un usuario anula sus faltas');
reset role;

do $$ begin
  -- 4 faltas: sin publicar hasta que lo revise el admin.
  perform pg_temp.falta(1);
  assert suspendido_hasta('00000000-0000-0000-0000-0000000000f1') = 'infinity', 'con 4 faltas no queda suspendido hasta revisión';
end $$;

-- El admin anula faltas y la cuenta vuelve a publicar.
select pg_temp.como('00000000-0000-0000-0000-0000000000a0');
select anular_falta(id) from faltas where detalle in ('Prueba 1');
reset role;
do $$ begin
  assert faltas_activas('00000000-0000-0000-0000-0000000000f1') = 0, 'no anuló las faltas';
  assert suspendido_hasta('00000000-0000-0000-0000-0000000000f1') is null, 'sigue suspendido con faltas anuladas';
end $$;

-- Las faltas de hace más de 180 días no cuentan.
insert into faltas (usuario_id, origen, detalle, created_at) values ('00000000-0000-0000-0000-0000000000f1', 'manual', 'Vieja', now() - interval '200 days');
do $$ begin assert faltas_activas('00000000-0000-0000-0000-0000000000f1') = 0, 'cuenta una falta vencida'; end $$;

-- El admin audita una moderación del muestreo; un usuario común, no.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
update moderaciones set auditoria = 'error' where lote_id = '50000000-0000-0000-0000-000000000001';
reset role;
do $$ begin assert (select auditoria is null from moderaciones where lote_id = '50000000-0000-0000-0000-000000000001'), 'un usuario audita la moderación'; end $$;
select pg_temp.como('00000000-0000-0000-0000-0000000000a0');
update moderaciones set auditoria = 'acierto', auditada_at = now() where lote_id = '50000000-0000-0000-0000-000000000001';
reset role;
do $$ begin assert (select auditoria = 'acierto' from moderaciones where lote_id = '50000000-0000-0000-0000-000000000001'), 'el admin no puede auditar'; end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
