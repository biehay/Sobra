-- Categoría nueva: "Fibra óptica y telecomunicaciones" (cables, conectores,
-- equipos). Se agrega su factor de CO₂ para la constancia de impacto: mezcla de
-- cable (polímeros y vidrio) y equipos electrónicos, valor de referencia aproximado.
-- Las categorías son texto: no hace falta cambiar la tabla de lotes.
create or replace function public.factor_co2(p_categoria text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_categoria
    when 'Cerámicos y porcelanatos' then 0.78
    when 'Sanitarios y grifería' then 1.6
    when 'Electricidad e iluminación' then 3.0
    when 'Fibra óptica y telecomunicaciones' then 3.5
    when 'Plomería y gas' then 2.5
    when 'Cemento, cal y áridos' then 0.5
    when 'Hierros y perfiles' then 1.55
    when 'Maderas y placas' then 0.45
    when 'Aberturas' then 3.0
    when 'Pinturas e impermeabilizantes' then 2.5
    when 'Aislantes y durlock' then 0.6
    when 'Herramientas y equipos' then 2.0
    else 1.0
  end;
$$;
