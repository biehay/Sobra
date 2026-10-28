# Sobrá

Marketplace B2B gestionado para vender materiales de construcción sobrantes en el AMBA.
Lotes verificados, precio sugerido, compradores verificados, cobro protegido y retiro coordinado.

Hecho con **Next.js 16** (App Router), **Supabase** (base de datos, login y fotos) y **Tailwind CSS 4**.

## Cómo funciona una operación

Hay una sola cuenta para comprar y vender. Cualquier usuario puede publicar (cada lote lo revisa el
admin); para ofertar, el admin tiene que haber verificado la cuenta. Nadie puede ofertar por su propio lote.

1. El **vendedor** carga un lote (fotos, materiales, precio, retiro) y lo envía a revisión.
2. El **admin** lo revisa y lo publica con un precio de publicación (o lo devuelve con observaciones).
3. Un **comprador verificado** hace una oferta por el lote completo.
4. El vendedor la **acepta**: el lote queda reservado y las demás ofertas se rechazan.
5. El comprador transfiere a Sobrá y el admin **confirma el pago**. Recién ahí ambos ven el contacto
   del otro y la dirección de retiro, y el comprador recibe un **código de retiro** de 6 dígitos.
6. En el retiro, el comprador revisa el material y, si está todo bien, le da el código al vendedor.
   El vendedor lo **carga en su panel** y la venta queda completa (el lote pasa a vendido). Después de
   5 intentos con un código incorrecto se bloquea, para que no se pueda adivinar.
7. Si algo sale mal (el material no coincide, el comprador no se presenta), cualquiera de los dos
   **abre un reclamo**. La operación queda en pausa y el admin decide: devolver el pago, completar la
   venta o cerrar el reclamo sin cambios.
8. El admin le transfiere al vendedor el monto menos la comisión (12%) y lo **marca como transferido**.

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
6. **Activá la verificación en dos pasos**: al entrar a `/admin` la app te pide escanear un código
   QR con una app autenticadora (Google Authenticator, Microsoft Authenticator, etc.). Es obligatoria
   para el admin: sin ella la base no le da permisos de admin, aunque tenga la contraseña.

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

## Seguridad y datos personales

- **Contraseñas**: la app nunca las ve ni las guarda. Las maneja Supabase Auth, que guarda solo un
  hash con bcrypt (no se puede revertir; ni Supabase ni nosotros podemos leerlas).
- **Tarjetas**: la app nunca recibe ni guarda datos de tarjetas. Cuando se integre Mercado Pago, el
  comprador las carga en el formulario de Mercado Pago (certificado PCI DSS) y a Sobrá solo le llega
  el resultado del pago.
- **Datos personales** (CUIT, WhatsApp, dirección de retiro, email): los permisos de la base (RLS)
  hacen que cada usuario vea solo lo suyo. El contacto y la dirección de la contraparte se revelan
  recién cuando el pago está confirmado. Supabase cifra la base y los backups en disco (AES-256) y
  todo viaja por HTTPS.
- **Fotos**: antes de subirlas se borran los metadatos (incluidas las coordenadas GPS que guardan los
  celulares), para no revelar la ubicación del depósito.
- **Claves secretas**: `SUPABASE_SERVICE_ROLE_KEY` y `RESEND_API_KEY` solo existen en el servidor
  (el código que las usa está marcado `server-only`). `.env.local` no se sube a GitHub.
- **Verificación en dos pasos**: obligatoria para el admin y opcional para el resto (en *Mis datos*).
  La exige la propia base: con solo la contraseña, una cuenta de admin no ve ni modifica nada ajeno.
  Si perdés el celular, entrá a Supabase (*Authentication > Users*, tu usuario, *Remove MFA factor*)
  o corré en el *SQL Editor*:
  `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'TU-EMAIL');`
  y volvé a activarla.
- **Cookies**: solo las necesarias para la sesión; no hay cookies de publicidad ni de análisis. Un
  aviso lo informa la primera vez y las páginas `/privacidad` y `/terminos` lo detallan. **Hacé
  revisar esos dos textos por un abogado antes de lanzar** (y consultá la inscripción de la base de
  datos ante la Agencia de Acceso a la Información Pública). El email de contacto que muestran se
  configura con `NEXT_PUBLIC_EMAIL_CONTACTO`.
- **Navegador**: la app envía encabezados de seguridad (CSP, HSTS, anti-clickjacking) definidos en
  `next.config.ts`.

## Pruebas

`npm test` corre las pruebas de la app (precio sugerido, teléfonos, formatos y plantillas de email).

### Recorrido completo en el navegador

`pruebas/recorrido.mjs` usa la app como lo haría una persona, en un navegador real y contra un Supabase
local: aviso de cookies, registro con código por email, admin con dos pasos, carga de un lote con fotos,
revisión, ofertas, pago, código de retiro, reclamo, liquidación, perfil y recuperación de contraseña.
Termina con la lista de problemas encontrados (errores de JavaScript, errores del servidor o pasos
que no funcionaron) y guarda capturas de cada pantalla en `pruebas/capturas/`.

Necesita [Docker](https://www.docker.com/products/docker-desktop/) para el Supabase local:

```bash
npx supabase start          # la primera vez descarga todo; al final muestra las claves
npx supabase db reset       # base limpia con todas las migraciones
npx playwright install chromium
# en .env.local: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 y las claves de "supabase status"
npm run build && npm start  # en otra terminal
SUPABASE_SERVICE_ROLE_KEY=<clave service_role local> npm run test:recorrido
```

Los emails del Supabase local (por ejemplo, los códigos de verificación) se ven en http://127.0.0.1:54324.

### Base de datos

`supabase/tests/flujo_operacion.sql` recorre una operación completa y `supabase/tests/retiro_y_reclamos.sql`
el código de retiro y los reclamos. Verifican que cada regla de seguridad bloquee lo que tiene que
bloquear. Se corren contra un PostgreSQL local con `supabase/tests/stub_supabase.sql` (simula lo mínimo
de Supabase):

```bash
createdb sobra_test
psql -d sobra_test -f supabase/tests/stub_supabase.sql $(ls supabase/migrations/*.sql | sed 's/^/-f /')
psql -d sobra_test -f supabase/tests/flujo_operacion.sql     # termina con "TODAS LAS PRUEBAS PASARON"
psql -d sobra_test -f supabase/tests/retiro_y_reclamos.sql   # ídem
```

## Estructura

```
src/app/
  page.tsx                 portada
  lotes/                   catálogo y detalle del lote (con el formulario de oferta)
  (auth)/                  ingresar y registro
  panel/vendedor/          "Mis ventas": mis lotes, cargar/editar lote, ofertas recibidas
  panel/comprador/         "Mis compras": mis ofertas, pago, código y datos de retiro
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
