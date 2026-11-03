-- Publicación automática: solo para vendedores de confianza y lotes que pasan
-- los controles; el resto queda en revisión manual. Se corre contra una base con
-- las migraciones aplicadas (ver README).
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

-- Una empresa verificada con CUIT, una persona verificada sin CUIT ni ventas, y otra sin verificar.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"nombre":"Empresa"}'),
  ('00000000-0000-0000-0000-0000000000e2', '{"nombre":"Persona"}'),
  ('00000000-0000-0000-0000-0000000000e3', '{"nombre":"Sin verificar"}');
update perfiles set verificado = true, cuit = '30-71234567-8' where id = '00000000-0000-0000-0000-0000000000e1';
update perfiles set verificado = true where id = '00000000-0000-0000-0000-0000000000e2';
update perfiles set cuit = '30-71234567-8' where id = '00000000-0000-0000-0000-0000000000e3';

create function pg_temp.lote(id uuid, vendedor uuid, titulo text, cambios jsonb default '{}') returns void language plpgsql as $$
begin
  perform pg_temp.como(vendedor);
  insert into lotes (id, vendedor_id, titulo, categoria, condicion, zona, precio_pedido, precio_lista, peso_kg, fotos, descripcion, estado)
  values (
    id, vendedor, titulo, 'Cerámicos y porcelanatos', 'nuevo', 'CABA',
    coalesce((cambios->>'precio_pedido')::numeric, 100), coalesce((cambios->>'precio_lista')::numeric, 200),
    case when cambios ? 'sin_peso' then null else 50 end,
    case when cambios ? 'sin_fotos' then '{}'::text[] else array[vendedor::text || '/a.jpg'] end,
    coalesce(cambios->>'descripcion', ''), 'en_revision'
  );
  if not cambios ? 'sin_retiro' then
    insert into lote_retiro (lote_id, direccion) values (id, 'Calle 123');
  end if;
end $$;

do $$ begin
  -- Empresa de confianza y lote sin problemas: se publica solo, al precio pedido.
  perform pg_temp.lote('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato 60x60');
  assert publicar_automatico('20000000-0000-0000-0000-000000000001') = 'publicado', 'una empresa de confianza no publica al instante';
  assert (select estado = 'publicado' and precio_publicado = 100 and publicado_automatico from lotes where id = '20000000-0000-0000-0000-000000000001'), 'no quedó publicado bien';

  -- Controles que mandan a revisión manual.
  perform pg_temp.lote('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"descripcion":"Llamame al 11 2345 6789"}');
  assert publicar_automatico('20000000-0000-0000-0000-000000000002') = 'contacto', 'deja pasar un teléfono';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato, escribime a juan@gmail.com');
  assert publicar_automatico('20000000-0000-0000-0000-000000000003') = 'contacto', 'deja pasar un email';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"descripcion":"Consultas por WhatsApp"}');
  assert publicar_automatico('20000000-0000-0000-0000-000000000004') = 'contacto', 'deja pasar WhatsApp';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"precio_pedido":300}');
  assert publicar_automatico('20000000-0000-0000-0000-000000000005') = 'precio', 'deja pasar un precio más caro que el de lista';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"sin_fotos":true}');
  assert publicar_automatico('20000000-0000-0000-0000-000000000006') = 'sin_fotos', 'publica sin fotos';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"sin_peso":true}');
  assert publicar_automatico('20000000-0000-0000-0000-000000000007') = 'sin_peso', 'publica sin peso';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000e1', 'Porcelanato', '{"sin_retiro":true}');
  assert publicar_automatico('20000000-0000-0000-0000-000000000008') = 'sin_retiro', 'publica sin dirección de retiro';
  -- Medidas y cantidades normales no son un teléfono.
  perform pg_temp.lote('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000e1', 'Bobina de fibra 4000 m, 24 hilos, 60x60');
  assert publicar_automatico('20000000-0000-0000-0000-000000000009') = 'publicado', 'confunde una medida con un teléfono';

  -- Sin CUIT ni ventas, o sin verificar: revisión manual.
  perform pg_temp.lote('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000e2', 'Porcelanato');
  assert publicar_automatico('20000000-0000-0000-0000-000000000010') = 'no_confiable', 'una persona sin ventas publica sola';
  perform pg_temp.lote('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e3', 'Porcelanato');
  assert publicar_automatico('20000000-0000-0000-0000-000000000011') = 'no_confiable', 'una cuenta sin verificar publica sola';
  assert (select estado = 'en_revision' from lotes where id = '20000000-0000-0000-0000-000000000011'), 'cambió el estado igual';
end $$;

-- Nadie puede publicar el lote de otro, ni llamar a la función sin cuenta.
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select pg_temp.debe_fallar($$select publicar_automatico('20000000-0000-0000-0000-000000000002')$$, 'publica el lote de otro');
reset role;
set local role anon;
select pg_temp.debe_fallar($$select publicar_automatico('20000000-0000-0000-0000-000000000002')$$, 'un visitante llama a la función');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
