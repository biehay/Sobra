import type { Metadata } from "next";
import Link from "next/link";
import { EMAIL_CONTACTO, PaginaLegal } from "@/components/pagina-legal";

export const metadata: Metadata = { title: "Devoluciones y reclamos" };

const enlace = "font-semibold text-marca hover:underline";

export default function Devoluciones() {
  return (
    <PaginaLegal titulo="Devoluciones y reclamos" actualizada="29 de octubre de 2026">
      <p>
        En Sobrá el dinero del comprador queda retenido hasta que retira el material y lo acepta. Así, si algo sale mal,
        el pago todavía no le llegó al vendedor y se puede devolver.
      </p>

      <h2>Antes de entregar el código de retiro</h2>
      <ul>
        <li>
          En el retiro, revisá el material con tiempo. <strong>Si no coincide con la publicación</strong> (cantidades,
          estado, modelo), no entregues el código de retiro.
        </li>
        <li>
          Abrí un reclamo desde <Link href="/panel/comprador" className={enlace}>Mis compras</Link>, con fotos si podés. La
          operación queda en pausa y el vendedor no cobra mientras lo analizamos.
        </li>
        <li>
          Hablamos con las dos partes y decidimos: <strong>devolverte el pago</strong>, completar la venta (por ejemplo, si
          se corrigió lo que faltaba) o seguir con el retiro.
        </li>
      </ul>

      <h2>Si el vendedor o el comprador no cumple</h2>
      <ul>
        <li>Si el comprador no se presenta a retirar, el vendedor puede abrir un reclamo desde Mis ventas.</li>
        <li>Si el vendedor no entrega el material, el comprador abre el reclamo y le devolvemos el pago.</li>
      </ul>

      <h2>Después de entregar el código</h2>
      <p>
        Entregar el código significa que revisaste el material y lo aceptaste, y con eso se libera el pago al vendedor. Si
        después encontrás un defecto que no se podía ver en el retiro, escribinos a{" "}
        <a href={`mailto:${EMAIL_CONTACTO}`} className={enlace}>{EMAIL_CONTACTO}</a> dentro de los 10 días corridos, con
        fotos y el detalle, y lo analizamos con el vendedor. Esto no limita las garantías que te da la ley.
      </p>

      <h2>Cómo te devolvemos el dinero</h2>
      <ul>
        <li>Te devolvemos el monto completo que pagaste, por transferencia a una cuenta a tu nombre.</li>
        <li>Lo hacemos dentro de los 5 días hábiles desde que se resuelve el reclamo y te avisamos por email.</li>
        <li>Si el reclamo se resuelve a favor de la devolución, el vendedor no paga comisión por esa operación.</li>
      </ul>

      <h2 id="arrepentimiento">Derecho de arrepentimiento</h2>
      <p>
        Si sos consumidor final, tenés derecho a revocar la compra dentro de los <strong>10 días corridos</strong> desde que
        retiraste el material (o desde que pagaste, si todavía no lo retiraste), sin dar motivos y sin costo. Para pedirlo,
        usá el <Link href="/arrepentimiento" className={enlace}>Botón de arrepentimiento</Link>: te damos un código de
        trámite y te contactamos para coordinar la devolución del material y del dinero.
      </p>

      <h2>¿Necesitás ayuda?</h2>
      <p>
        Entrá al <Link href="/ayuda" className={enlace}>Centro de ayuda</Link> o escribinos a{" "}
        <a href={`mailto:${EMAIL_CONTACTO}`} className={enlace}>{EMAIL_CONTACTO}</a>.
      </p>
    </PaginaLegal>
  );
}
