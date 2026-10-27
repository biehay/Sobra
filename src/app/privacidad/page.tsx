import type { Metadata } from "next";
import { EMAIL_CONTACTO, PaginaLegal } from "@/components/pagina-legal";

export const metadata: Metadata = { title: "Privacidad y cookies" };

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad y cookies" actualizada="27 de octubre de 2026">
      <p>
        En Sobrá cuidamos los datos de las personas y empresas que usan el marketplace. Esta política explica qué datos
        juntamos, para qué los usamos, quién los ve y qué derechos tenés, de acuerdo con la Ley 25.326 de Protección de
        Datos Personales.
      </p>

      <h2>Qué datos juntamos</h2>
      <ul>
        <li><strong>De tu cuenta:</strong> nombre, email, WhatsApp, zona y, si los cargás, empresa y CUIT.</li>
        <li><strong>De tus lotes:</strong> fotos, descripción, materiales, precios y dirección de retiro.</li>
        <li><strong>De tus operaciones:</strong> ofertas, montos, estado de los pagos, retiros y reclamos.</li>
      </ul>
      <p>
        <strong>No guardamos tu contraseña</strong>: solo un resumen cifrado que no se puede revertir.{" "}
        <strong>No recibimos ni guardamos datos de tarjetas.</strong> Antes de subir tus fotos borramos los datos de
        ubicación (GPS) que guarda el celular.
      </p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Crear y proteger tu cuenta, incluida la verificación por código.</li>
        <li>Publicar tus lotes y conectar a vendedores con compradores.</li>
        <li>Coordinar pagos, retiros y reclamos, y avisarte por email de cada paso.</li>
        <li>Verificar a los compradores y prevenir fraudes.</li>
        <li>Cumplir obligaciones legales e impositivas.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad.</p>

      <h2>Quién ve tus datos</h2>
      <ul>
        <li><strong>Otros usuarios:</strong> los lotes publicados muestran zona y localidad, nunca tu nombre ni tu dirección.</li>
        <li>
          <strong>La otra parte de una operación:</strong> recién cuando el pago está confirmado, comprador y vendedor
          ven el nombre, la empresa y el WhatsApp del otro, y el comprador ve la dirección de retiro.
        </li>
        <li><strong>El equipo de Sobrá:</strong> para revisar lotes, verificar usuarios y resolver reclamos.</li>
        <li>
          <strong>Proveedores que nos prestan servicios:</strong> Supabase (base de datos y archivos), Resend (envío de
          emails) y, cuando se habilite, Mercado Pago (pagos). Solo reciben lo necesario para prestar su servicio.
        </li>
      </ul>

      <h2>Cómo los protegemos</h2>
      <p>
        Toda la información viaja cifrada (HTTPS) y se guarda cifrada. Cada usuario accede solo a lo suyo; esa regla está
        en la propia base de datos. Las cuentas de administración usan verificación en dos pasos.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tengas la cuenta activa. Si la cerrás, borramos tus datos, salvo los de operaciones que la ley nos obliga a
        conservar (por ejemplo, para facturación) durante el plazo que corresponda.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir en cualquier momento acceder a tus datos, corregirlos o eliminarlos, escribiendo a{" "}
        <a href={`mailto:${EMAIL_CONTACTO}`} className="font-semibold text-marca hover:underline">{EMAIL_CONTACTO}</a>.
        Los datos de tu perfil los podés editar vos desde <em>Mis datos</em>. Te respondemos dentro de los plazos de la ley
        (10 días corridos para el acceso y 5 días hábiles para la rectificación o supresión).
      </p>
      <p className="text-sm text-stone-500">
        La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la
        atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por
        incumplimiento de las normas vigentes en materia de protección de datos personales.
      </p>

      <h2 id="cookies">Cookies</h2>
      <p>
        Las cookies son pequeños archivos que el sitio guarda en tu navegador. Sobrá usa <strong>solo cookies
        necesarias</strong> para funcionar. No usamos cookies de publicidad, de análisis ni de terceros que te sigan por
        otros sitios.
      </p>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Para qué sirve</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sb-…-auth-token</code></td>
            <td>Mantener tu sesión iniciada. Se crea al ingresar y se borra al salir.</td>
            <td>Hasta que cierres sesión</td>
          </tr>
          <tr>
            <td><code>sb-…-code-verifier</code></td>
            <td>Validar el link de recuperación de contraseña. Solo existe durante ese trámite.</td>
            <td>Minutos</td>
          </tr>
          <tr>
            <td><code>sobra_cookies</code></td>
            <td>Recordar que ya viste el aviso de cookies.</td>
            <td>1 año</td>
          </tr>
        </tbody>
      </table>
      <p>
        Como son necesarias para iniciar sesión, si las bloqueás desde tu navegador vas a poder ver los lotes pero no
        ingresar a tu cuenta.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, lo vamos a avisar en el sitio y, si el cambio es importante, por email.</p>
    </PaginaLegal>
  );
}
