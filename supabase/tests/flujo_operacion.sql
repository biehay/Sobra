-- Prueba del flujo completo de una operación y de los permisos.
-- Se corre contra una base con la migración aplicada (ver README).
-- Cada bloque "debe fallar" verifica que la regla de seguridad bloquee la acción.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.como(usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario::text, ''), true);
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
  ('00000000-0000-0000-0000-00000000000a', '{"rol":"admin","nombre":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"rol":"vendedor","nombre":"Constructora Sur","telefono":"1111"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"rol":"comprador","nombre":"Juan Contratista","telefono":"2222"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"rol":"comprador","nombre":"Sin verificar"}');

-- Registrarse como admin no da el rol de admin.
do $$ begin
  assert (select rol from perfiles where id = '00000000-0000-0000-0000-00000000000a') = 'comprador';
end $$;
update perfiles set rol = 'admin', verificado = true where id = '00000000-0000-0000-0000-00000000000a';

-- Vendedor carga un lote y lo manda a revisión.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_lista, precio_pedido, estado, precio_publicado)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
        'Porcelanato 60x60 gris, 45 m2', 'Cerámicos y porcelanatos', 'nuevo', 'GBA Sur', 900000, 500000, 'en_revision', 1);
insert into lote_retiro values ('10000000-0000-0000-0000-000000000001', 'Calle Falsa 123, Lanús', 'Lun a vie 8 a 17', '');
do $$ begin
  assert (select precio_publicado from lotes) is null, 'el vendedor no puede fijar el precio publicado';
end $$;
select pg_temp.debe_fallar($$update lotes set estado = 'publicado'$$, 'vendedor se autopublica');
select pg_temp.debe_fallar($$update perfiles set verificado = true where id = auth.uid()$$, 'usuario se autoverifica');

-- Un comprador no ve el lote en revisión ni los datos de retiro.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from lotes) = 0, 'lote en revisión visible';
  assert (select count(*) from lote_retiro) = 0, 'retiro visible';
end $$;
select pg_temp.debe_fallar($$insert into lotes (vendedor_id, titulo, categoria, condicion, zona, precio_pedido)
  values (auth.uid(), 'Lote del comprador', 'Otros', 'nuevo', 'CABA', 10)$$, 'comprador crea lote');

-- Admin publica con precio sugerido y verifica al comprador.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update lotes set estado = 'publicado', precio_sugerido = 480000, precio_publicado = 480000;
update perfiles set verificado = true where id = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select publicado_at from lotes) is not null;
end $$;

-- Visitante anónimo ve el lote publicado pero no perfiles.
select pg_temp.como(null);
do $$ begin
  assert (select count(*) from lotes) = 1, 'anónimo no ve lote publicado';
  assert (select count(*) from perfiles) = 0, 'anónimo ve perfiles';
end $$;

-- Comprador sin verificar no puede ofertar.
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.debe_fallar($$insert into ofertas (lote_id, comprador_id, monto)
  values ('10000000-0000-0000-0000-000000000001', auth.uid(), 400000)$$, 'comprador sin verificar oferta');

-- Comprador verificado oferta; no puede autoaceptarse.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
insert into ofertas (id, lote_id, comprador_id, monto, estado)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', auth.uid(), 450000, 'pagada');
do $$ begin
  assert (select estado from ofertas) = 'pendiente', 'la oferta debe nacer pendiente';
end $$;
select pg_temp.debe_fallar($$select responder_oferta('20000000-0000-0000-0000-000000000001', true)$$, 'comprador acepta su oferta');
select pg_temp.debe_fallar($$update ofertas set estado = 'aceptada'$$, 'comprador edita la oferta');

-- Vendedor ve la oferta y la acepta: el lote queda reservado.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from ofertas) = 1, 'vendedor no ve ofertas de su lote';
end $$;
select responder_oferta('20000000-0000-0000-0000-000000000001', true);
do $$ begin
  assert (select estado from lotes) = 'reservado';
  assert (select comision from ofertas) = 54000.00, 'comisión del 12%';
  assert (select count(*) from datos_operacion('20000000-0000-0000-0000-000000000001')) = 0, 'contactos antes del pago';
end $$;
select pg_temp.debe_fallar($$update lotes set titulo = 'Cambio durante la reserva'$$, 'editar lote reservado');
select pg_temp.debe_fallar($$select confirmar_pago('20000000-0000-0000-0000-000000000001')$$, 'vendedor confirma pago');

-- Admin confirma el pago: se revelan contactos y retiro.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select confirmar_pago('20000000-0000-0000-0000-000000000001');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select direccion from datos_operacion('20000000-0000-0000-0000-000000000001')) = 'Calle Falsa 123, Lanús';
  assert (select vendedor_telefono from datos_operacion('20000000-0000-0000-0000-000000000001')) = '1111';
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from datos_operacion('20000000-0000-0000-0000-000000000001')) = 0, 'tercero ve contactos';
end $$;

-- Admin confirma el retiro: el lote queda vendido.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select completar_operacion('20000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select estado from lotes) = 'vendido';
  assert (select estado from ofertas) = 'completada';
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
