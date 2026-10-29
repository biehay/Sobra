import type { Metadata } from "next";
import Link from "next/link";
import { COMPROMISOS, EMAIL_CONTACTO } from "@/components/pagina-legal";
import { TASA_COMISION, linkWhatsapp } from "@/lib/datos";

export const metadata: Metadata = { title: "Centro de ayuda" };

const enlace = "font-semibold text-marca hover:underline";

// Preguntas frecuentes agrupadas por tema. Los <details> se abren sin JavaScript.
const TEMAS: { titulo: string; preguntas: [string, React.ReactNode][] }[] = [
  {
    titulo: "Vender",
    preguntas: [
      ["¿Cuánto cuesta publicar?", `Publicar es gratis. Solo si vendés, Sobrá cobra una comisión del ${Math.round(TASA_COMISION * 100)}% sobre el monto de la venta.`],
      ["¿Cuánto tarda en publicarse mi lote?", "Lo revisamos y te avisamos por email. Si falta algo (por ejemplo, una foto), te lo devolvemos con observaciones para que lo corrijas."],
      ["¿Cómo sé a qué precio publicarlo?", "Al cargar el precio de lista te mostramos un precio sugerido según el estado del material. Lo confirmamos con vos al revisarlo."],
      ["¿Cuándo cobro?", <>Cuando el comprador retira y te da el código de retiro, cargalo en Mis ventas. Te transferimos el monto menos la comisión y el comprobante queda en <Link href="/panel/cobros" className={enlace}>Cobros</Link>.</>],
      ["¿Qué es la baja automática de precio?", "Es opcional: al cargar el lote elegís cuánto baja por semana (5, 10 o 15%) y un precio mínimo. Si pasa una semana sin venderse, el precio baja solo, hasta ese mínimo, y les avisamos a quienes lo guardaron. Nadie ve tu mínimo."],
      ["¿Cómo sé qué se está buscando?", <>En <Link href="/buscados" className={enlace}>Lo que se está buscando</Link> ves lo que los compradores pidieron que les avisemos. Si tenés algo de eso, publicalo: les llega el aviso apenas lo aprobamos.</>],
      ["El comprador no vino a retirar, ¿qué hago?", "Abrí un reclamo desde Mis ventas. Lo contactamos y, si no se presenta, cancelamos la operación y tu lote vuelve a publicarse."],
    ],
  },
  {
    titulo: "Comprar",
    preguntas: [
      ["¿Por qué tengo que verificar mi cuenta para ofertar?", "Para que los vendedores operen tranquilos. Revisamos tus datos y te avisamos por email cuando ya podés ofertar."],
      ["¿Cómo pago?", "Cuando el vendedor acepta tu oferta, ves en Mis compras los datos para transferirle a Sobrá. Retenemos el dinero hasta que retirás el material."],
      ["¿Qué es el código de retiro?", "Un código de 6 números que ves en Mis compras cuando se confirma tu pago. Dáselo al vendedor solo después de revisar que el material esté bien: entregarlo significa que lo aceptás."],
      ["El material no es lo que decía la publicación", <>No entregues el código y abrí un reclamo desde Mis compras. Te explicamos todo en <Link href="/devoluciones" className={enlace}>Devoluciones y reclamos</Link>.</>],
      ["No encuentro lo que necesito", <>Guardalo en <Link href="/panel/busquedas" className={enlace}>Lo busco</Link> (o tocá “Avisame cuando aparezca” en el catálogo) y te mandamos un email apenas se publique un lote que coincida.</>],
      ["¿Puedo arrepentirme de una compra?", <>Si sos consumidor final, sí: tenés 10 días corridos. Usá el <Link href="/arrepentimiento" className={enlace}>Botón de arrepentimiento</Link>.</>],
    ],
  },
  {
    titulo: "Impacto y reputación",
    preguntas: [
      ["¿Qué es la constancia de material recuperado?", <>Un documento con los kilos de material que vendiste o compraste en Sobrá y el CO₂ que se evitó. La emitís desde <Link href="/panel/impacto" className={enlace}>Mi impacto</Link>, la guardás en PDF y lleva un código para que cualquiera la verifique.</>],
      ["¿Cómo se calcula el CO₂?", <>Multiplicamos los kilos reutilizados por un factor según el tipo de material. Es una estimación: lo explicamos en <Link href="/impacto" className={enlace}>Cómo calculamos el impacto</Link>.</>],
      ["¿Sirve como certificado oficial?", "No: es una constancia que emite Sobrá con los datos de sus operaciones, verificable con su código. Sirve como respaldo para informes de sustentabilidad, licitaciones o clientes, pero no reemplaza una certificación de un organismo acreditado."],
      ["¿Cómo se calcula mi reputación?", "Sola, con lo que cumplís: cuántas ventas completaste sin reclamos por el material, cuántas compras retiraste y qué tan rápido respondés ofertas. No se puede escribir ni editar, y con muy buenos números ganás sellos como “Material igual a las fotos”."],
    ],
  },
  {
    titulo: "Cuenta y seguridad",
    preguntas: [
      ["No me llega el código por email", "Revisá la carpeta de spam y esperá un minuto antes de pedir otro. Si sigue sin llegar, escribinos."],
      ["¿Por qué me piden un código cada vez que entro desde otro dispositivo?", "Para que nadie pueda entrar a tu cuenta con tu contraseña sola. El código confirma que también tenés acceso a tu email."],
      ["Me olvidé la contraseña", <>Entrá a <Link href="/recuperar" className={enlace}>Recuperar contraseña</Link> y te mandamos un código para crear una nueva.</>],
      ["¿Puedo comprar y vender con la misma cuenta?", "Sí. Con una sola cuenta publicás tus sobrantes y comprás los de otros."],
    ],
  },
];

export default function Ayuda() {
  const whatsapp = linkWhatsapp("Hola, necesito ayuda con Sobrá.");
  return (
    <div className="contenedor max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Centro de ayuda</h1>
      <p className="mt-2 text-stone-600">Respuestas rápidas a las dudas más comunes. Si no encontrás la tuya, escribinos.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a href={whatsapp} target="_blank" rel="noreferrer" className="tarjeta flex items-center gap-3 p-5 transition hover:shadow-md">
          <span className="flex size-11 items-center justify-center rounded-full bg-celeste-claro text-xl">💬</span>
          <span>
            <span className="block font-semibold">WhatsApp</span>
            <span className="text-sm text-stone-600">{COMPROMISOS.horarioSoporte}</span>
          </span>
        </a>
        <a href={`mailto:${EMAIL_CONTACTO}`} className="tarjeta flex items-center gap-3 p-5 transition hover:shadow-md">
          <span className="flex size-11 items-center justify-center rounded-full bg-celeste-claro text-xl">✉️</span>
          <span>
            <span className="block font-semibold">Email</span>
            <span className="text-sm text-stone-600">{EMAIL_CONTACTO}</span>
          </span>
        </a>
      </div>

      {TEMAS.map((tema) => (
        <section key={tema.titulo} className="mt-10">
          <h2 className="mb-3 text-xl font-bold">{tema.titulo}</h2>
          <div className="tarjeta divide-y divide-stone-100">
            {tema.preguntas.map(([pregunta, respuesta]) => (
              <details key={pregunta} className="group p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {pregunta}
                  <span aria-hidden className="text-stone-400 transition group-open:rotate-45">+</span>
                </summary>
                <div className="mt-2 text-stone-600">{respuesta}</div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 text-sm text-stone-500">
        También podés leer los <Link href="/terminos" className={enlace}>Términos y condiciones</Link>, la{" "}
        <Link href="/devoluciones" className={enlace}>Política de devoluciones</Link> y la{" "}
        <Link href="/privacidad" className={enlace}>Política de privacidad</Link>.
      </p>
    </div>
  );
}
