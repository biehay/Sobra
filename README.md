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
6. Cuando se retira el material, el admin **confirma el retiro**: el lote queda vendido.
7. El admin le transfiere al vendedor el monto menos la comisión (12%) y lo **marca como transferido**.

Las reglas (quién puede ver y hacer qué) están en la base de datos, en
`supabase/migrations/`, así que valen aunque alguien llame a la API directamente.

## Ponerlo en marcha en tu compu

Necesitás [Node.js 20 o más](https://nodejs.org) y una cuenta gratis en [Supabase](https://supabase.com).

1. **Creá el proyecto en Supabase** (New project, región São Paulo).
2. **Cargá la base de datos**: en Supabase, abrí *SQL Editor* y ejecutá, **en orden**, cada archivo de
   `supabase/migrations/` (pegás el contenido y le das *Run*). Cuando en el futuro aparezca un
   archivo nuevo en esa carpeta, ejecutás solo ese.
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

## Emails: código de verificación y avisos

La app manda dos tipos de email:

- **Código de verificación** al registrarse (y el link para recuperar la contraseña). Los envía
  **Supabase**: el usuario escribe el código de 6 dígitos en la página `/verificar`.
- **Avisos** de cada paso de la operación (nueva oferta, oferta aceptada, pago acreditado, lote
  publicado, etc.). Los envía la app con **Resend**.

Las dos cosas usan una sola cuenta de [Resend](https://resend.com) (gratis hasta 3.000 emails por mes):

1. **Creá la cuenta en Resend** y, en *Domains*, verificá tu dominio (por ejemplo `sobra.com.ar`).
   Sin dominio propio podés probar con `onboarding@resend.dev`, pero solo te llegan a vos.
2. **Avisos de la app**: en Resend creá una *API Key* y completá en `.env.local`:
   `RESEND_API_KEY`, `EMAIL_REMITENTE` (por ejemplo `Sobrá <avisos@sobra.com.ar>`),
   `ADMIN_EMAILS` (tu email) y `SUPABASE_SERVICE_ROLE_KEY` (en Supabase: *Project Settings > API*,
   la clave `service_role`, que es secreta).
3. **Emails de Supabase por Resend**: el servidor de email que trae Supabase solo manda unos pocos
   por hora y solo a los miembros de tu equipo, así que no sirve para usuarios reales. En Supabase,
   *Authentication > Emails > SMTP Settings*, activá *Custom SMTP* con:
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = tu API Key de Resend,
   y como remitente el mismo email de `EMAIL_REMITENTE`.
4. **Activá la confirmación por código**: en *Authentication > Sign In / Providers > Email*, dejá
   prendido *Confirm email*.
5. **Plantillas**: en *Authentication > Emails > Templates*:
   - *Confirm signup*: asunto `Tu código de Sobrá: {{ .Token }}` y como cuerpo pegá
     `supabase/templates/confirmar-cuenta.html`.
   - *Reset password*: asunto `Creá una nueva contraseña en Sobrá` y como cuerpo pegá
     `supabase/templates/recuperar-clave.html`.

Sin `RESEND_API_KEY` o sin `SUPABASE_SERVICE_ROLE_KEY` la app funciona igual: los avisos no se
envían y aparecen en la terminal donde corre `npm run dev`.

Para que funcionen los links de los emails (confirmar cuenta y recuperar contraseña), en Supabase
andá a *Authentication > URL Configuration* y agregá `http://localhost:3000/**` en *Redirect URLs*
(y más adelante la dirección pública de la app).

Mientras no tengas configurado el email (paso 3 de arriba), podés apagar *Confirm email* para
registrarte sin código.

## Pruebas

`npm test` corre las pruebas de la app (precio sugerido, formatos y plantillas de email).

### Base de datos

`supabase/tests/flujo_operacion.sql` recorre una operación completa y verifica que cada regla de
seguridad bloquee lo que tiene que bloquear. Se corre contra un PostgreSQL local con
`supabase/tests/stub_supabase.sql` (simula lo mínimo de Supabase):

```bash
createdb sobra_test
psql -d sobra_test -f supabase/tests/stub_supabase.sql $(ls supabase/migrations/*.sql | sed 's/^/-f /')
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
src/lib/email/              envío con Resend, plantillas y a quién avisar en cada paso
src/proxy.ts               mantiene la sesión y protege /panel y /admin
supabase/migrations/       esquema, permisos y funciones de la base
supabase/templates/        emails de Supabase: código de verificación y recuperar contraseña
```

## Pendiente para próximas versiones

- Cobro online con Mercado Pago (hoy el pago es por transferencia y lo confirma el admin).
- Avisos por WhatsApp además del email.
- Cotización de fletes por zona.
- Material recuperado de demolición y otros rubros.
