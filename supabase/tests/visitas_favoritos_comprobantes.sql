-- Visitas, favoritos y comprobantes de transferencia.
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
  ('00000000-0000-0000-0000-00000000000b', '{"nombre":"Constructora Sur"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"nombre":"Juan Contratista"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"nombre":"Otra vendedora"}');
update perfiles set rol = 'admin', verificado = true where id = '00000000-0000-0000-0000-00000000000a';
update perfiles set verificado = true where id = '00000000-0000-0000-0000-00000000000c';

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_lista, precio_pedido, estado)
values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Porcelanato 60x60', 'Cerámicos y porcelanatos', 'nuevo', 'GBA Sur', 900000, 500000, 'en_revision');

-- Favoritos: solo de lotes publicados, propios y con el segundo paso.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.debe_fallar($$insert into favoritos (lote_id) values ('10000000-0000-0000-0000-000000000001')$$, 'guarda un lote en revisión');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update lotes set estado = 'publicado', precio_publicado = 480000;

select pg_temp.como('00000000-0000-0000-0000-00000000000c', false);
select pg_temp.debe_fallar($$insert into favoritos (lote_id) values ('10000000-0000-0000-0000-000000000001')$$, 'guarda favorito sin dos pasos');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.debe_fallar($$insert into favoritos (usuario_id, lote_id) values ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001')$$, 'guarda favorito a nombre de otro');
insert into favoritos (lote_id, precio_guardado, precio_avisado) values ('10000000-0000-0000-0000-000000000001', 1, 1);
do $$ begin
  assert (select precio_guardado from favoritos) = 480000, 'el precio guardado lo pone la base';
  assert (select precio_avisado from favoritos) is null, 'el precio avisado lo pone la base';
end $$;
select pg_temp.debe_fallar($$update favoritos set precio_guardado = 999999999$$, 'edita su favorito');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$insert into favoritos (lote_id) values ('10000000-0000-0000-0000-000000000001')$$, 'guarda su propio lote');
do $$ begin
  assert (select count(*) from favoritos) = 0, 've favoritos ajenos';
end $$;
delete from favoritos;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from favoritos) = 1, 'otro usuario borró el favorito';
end $$;

-- Visitas: las registra solo el servidor y las ve solo el vendedor.
select pg_temp.debe_fallar($$insert into visitas_lote (lote_id, visitante) values ('10000000-0000-0000-0000-000000000001', 'x')$$, 'un usuario suma visitas');
reset role;
insert into visitas_lote (lote_id, visitante) values ('10000000-0000-0000-0000-000000000001', 'a'), ('10000000-0000-0000-0000-000000000001', 'b');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from visitas_lote) = 0, 'un tercero ve las visitas';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from visitas_lote) = 2, 'el vendedor no ve sus visitas';
  assert (select semana from visitas_de_mis_lotes()) = 2, 'no cuenta las visitas de la semana';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from visitas_de_mis_lotes()) = 0, 'un tercero ve visitas ajenas';
end $$;

-- Operación completa hasta la transferencia al vendedor.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
insert into ofertas (id, lote_id, comprador_id, monto, liquidada_at, comprobante)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', auth.uid(), 450000, now(), 'x/falso.pdf');
do $$ begin
  assert (select liquidada_at from ofertas) is null, 'la oferta nace liquidada';
  assert (select comprobante from ofertas) is null, 'la oferta nace con comprobante';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select responder_oferta('20000000-0000-0000-0000-000000000001', true);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select confirmar_pago('20000000-0000-0000-0000-000000000001');
select completar_operacion('20000000-0000-0000-0000-000000000001');

-- El comprobante tiene que estar en la carpeta del vendedor de la operación.
select pg_temp.debe_fallar($$select marcar_liquidada('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d/otro.pdf')$$, 'comprobante de otro vendedor');
select pg_temp.debe_fallar($$select adjuntar_comprobante('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b/c.pdf')$$, 'adjunta antes de transferir');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$select marcar_liquidada('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b/c.pdf')$$, 'el vendedor se liquida');
select pg_temp.como('00000000-0000-0000-0000-00000000000a', false);
select pg_temp.debe_fallar($$select marcar_liquidada('20000000-0000-0000-0000-000000000001')$$, 'admin sin dos pasos liquida');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select marcar_liquidada('20000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select liquidada_at from ofertas) is not null and (select comprobante from ofertas) is null;
end $$;
select adjuntar_comprobante('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b/c.pdf');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select comprobante from ofertas) = '00000000-0000-0000-0000-00000000000b/c.pdf', 'el vendedor no ve su comprobante';
end $$;
select pg_temp.debe_fallar($$select adjuntar_comprobante('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b/d.pdf')$$, 'el vendedor cambia el comprobante');

-- Storage: el admin sube, cada vendedor ve solo su carpeta.
reset role;
insert into storage.objects (bucket_id, name) values
  ('comprobantes', '00000000-0000-0000-0000-00000000000b/c.pdf'),
  ('comprobantes', '00000000-0000-0000-0000-00000000000d/otro.pdf');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'comprobantes') = 1, 've comprobantes ajenos';
end $$;
select pg_temp.debe_fallar($$insert into storage.objects (bucket_id, name) values ('comprobantes', '00000000-0000-0000-0000-00000000000b/trucho.pdf')$$, 'el vendedor sube un comprobante');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name) values ('comprobantes', '00000000-0000-0000-0000-00000000000b/nuevo.pdf');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
