-- Precios que reportan los usuarios: cuánto les costó un material nuevo (desde la
-- calculadora de la portada o al publicar un lote con precio de lista). Sirven de
-- referencia para la próxima persona que tase el mismo producto, sin buscar en la web.
--
-- No se guarda quién es: solo un identificador anónimo (hash) para contar cuántas
-- personas distintas reportaron un precio parecido. El precio por unidad se guarda
-- en dólares (con el dólar del día del reporte) para que no lo desactualice la inflación.
create table public.precios_reportados (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(texto) between 3 and 200),
  palabras text[] not null default '{}',
  categoria text,
  marca text check (marca is null or char_length(marca) <= 60),
  unidad text not null check (char_length(unidad) between 1 and 20),
  precio_usd_por_unidad numeric(18, 6) not null check (precio_usd_por_unidad > 0),
  dolar numeric(12, 2) not null check (dolar > 0),
  quien text not null check (char_length(quien) between 8 and 80),
  origen text not null check (origen in ('calculadora', 'publicacion')),
  created_at timestamptz not null default now()
);

create index precios_reportados_palabras_idx on public.precios_reportados using gin (palabras);
create index precios_reportados_fecha_idx on public.precios_reportados (created_at desc);

-- Solo el servidor (service role) los lee y los escribe: ningún usuario los ve.
alter table public.precios_reportados enable row level security;
revoke all on public.precios_reportados from anon, authenticated;
