# Sobrá

Marketplace B2B gestionado para vender materiales de construcción sobrantes en el AMBA.
Lotes verificados, precio sugerido, compradores verificados, cobro protegido y retiro coordinado.

Hecho con **Next.js 16** (App Router), **Supabase** (base de datos, login y fotos) y **Tailwind CSS 4**.

## Cómo funciona una operación

1. El **vendedor** carga un lote (fotos, materiales, precio, retiro) y lo envía a revisión.
2. El **admin** lo revisa y lo publica con un precio de publicación (o lo devuelve con observaciones).
3. Un **comprador verificado** hace una oferta por el lote completo.
4. El vendedor la **acepta**: el lote queda reservado y las demás ofertas se rechazan.
5. El comprador transfiere a Sobrá y el admin **confirma el pago**. Recién ahí ambos ven el contacto
   del otro y la dirección de retiro.
6. Cuando se retira el material, el admin **confirma el retiro**: el lote queda vendido y se le
   liquida al vendedor el monto menos la comisión (12%).

Las reglas (quién puede ver y hacer qué) están en la base de datos, en
`supabase/migrations/`, así que valen aunque alguien llame a la API directamente.

## Ponerlo en marcha en tu compu

Necesitás [Node.js 20 o más](https://nodejs.org) y una cuenta gratis en [Supabase](https://supabase.com).

1. **Creá el proyecto en Supabase** (New project, región São Paulo).
2. **Cargá la base de datos**: en Supabase, abrí *SQL Editor*, pegá el contenido de
   `supabase/migrations/20261027000000_esquema_inicial.sql` y ejecutalo.
3. **Configurá las variables**: copiá `.env.example` como `.env.local` y completá
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (en Supabase: *Project Settings > API*).
4. **Instalá y arrancá**:
   ```bash
   npm install
   npm run dev
   ```
   Abrí http://localhost:3000.
5. **Hacete admin**: registrate en la app y después corré en el *SQL Editor* de Supabase:
   ```sql
   update perfiles set rol = 'admin', verificado = true
   where id = (select id from auth.users where email = 'TU-EMAIL');
   ```

Mientras probás, podés desactivar la confirmación por email en Supabase
(*Authentication > Sign In / Providers > Email > Confirm email*) para no tener que confirmar cada cuenta.

## Pruebas de la base de datos

`supabase/tests/flujo_operacion.sql` recorre una operación completa y verifica que cada regla de
seguridad bloquee lo que tiene que bloquear. Se corre contra un PostgreSQL local con
`supabase/tests/stub_supabase.sql` (simula lo mínimo de Supabase):

```bash
createdb sobra_test
psql -d sobra_test -f supabase/tests/stub_supabase.sql -f supabase/migrations/20261027000000_esquema_inicial.sql
psql -d sobra_test -f supabase/tests/flujo_operacion.sql   # termina con "TODAS LAS PRUEBAS PASARON"
```

## Estructura

```
src/app/
  page.tsx                 portada
  lotes/                   catálogo y detalle del lote (con el formulario de oferta)
  (auth)/                  ingresar y registro
  panel/vendedor/          mis lotes, cargar/editar lote, ofertas recibidas
  panel/comprador/         mis ofertas, pago y datos de retiro
  admin/                   revisión de lotes, operaciones, usuarios y métricas
src/lib/datos.ts           tipos, categorías, zonas, precio sugerido y formatos
src/proxy.ts               mantiene la sesión y protege /panel y /admin
supabase/migrations/       esquema, permisos y funciones de la base
```

## Pendiente para próximas versiones

- Cobro online con Mercado Pago (hoy el pago es por transferencia y lo confirma el admin).
- Avisos por email o WhatsApp cuando llega o cambia una oferta.
- Cotización de fletes por zona.
- Material recuperado de demolición y otros rubros.
