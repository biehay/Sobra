import type { Metadata } from "next";
import Link from "next/link";
import { EMAIL_CONTACTO, PaginaLegal } from "@/components/pagina-legal";
import { TASA_COMISION } from "@/lib/datos";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function Terminos() {
  const comision = `${Math.round(TASA_COMISION * 100)}%`;
  return (
    <PaginaLegal titulo="Términos y condiciones" actualizada="27 de octubre de 2026">
      <p>
        Sobrá es un marketplace que conecta a empresas que tienen materiales de construcción sobrantes con compradores
        interesados en el AMBA. Al crear una cuenta aceptás estas condiciones.
      </p>

      <h2>1. Qué es Sobrá</h2>
      <p>
        Sobrá es un intermediario: no compra, no vende ni almacena los materiales. Verificamos los lotes y a los
        compradores, y coordinamos el pago y el retiro, pero la compraventa es entre el vendedor y el comprador.
      </p>

      <h2>2. Cuentas</h2>
      <ul>
        <li>Tenés que ser mayor de edad y dar datos reales. Confirmamos tu email con un código.</li>
        <li>Sos responsable de cuidar tu contraseña. Te recomendamos activar la verificación en dos pasos.</li>
        <li>Los compradores tienen que estar verificados por Sobrá para poder ofertar.</li>
        <li>Podemos suspender cuentas que den datos falsos, incumplan estas reglas o intenten estafar.</li>
      </ul>

      <h2>3. Publicar un lote</h2>
      <ul>
        <li>Solo se pueden publicar materiales propios, nuevos, sin uso o usados en buen estado.</li>
        <li>No se aceptan escombros, residuos, materiales peligrosos ni productos de origen dudoso.</li>
        <li>Las fotos y la descripción tienen que mostrar el estado real del material.</li>
        <li>Revisamos cada lote antes de publicarlo y podemos pedir cambios o rechazarlo.</li>
        <li>El precio de publicación lo confirmamos con vos al revisarlo. Publicar es gratis.</li>
      </ul>

      <h2>4. Ofertas y compra</h2>
      <ul>
        <li>Las ofertas son por el lote completo. Cuando el vendedor acepta una, el lote queda reservado.</li>
        <li>El comprador paga antes del retiro. Sobrá retiene el pago hasta que se completa el retiro.</li>
        <li>Los datos de contacto y la dirección de retiro se comparten recién cuando el pago está confirmado.</li>
      </ul>

      <h2>5. Retiro y código de retiro</h2>
      <ul>
        <li>Al confirmarse el pago, el comprador recibe un código de retiro de 6 dígitos.</li>
        <li>
          En el retiro, el comprador revisa el material y, <strong>si está todo bien</strong>, le da el código al vendedor.
          Entregar el código significa aceptar el material.
        </li>
        <li>El retiro corre por cuenta del comprador, salvo que se haya acordado un flete con Sobrá.</li>
      </ul>

      <h2>6. Reclamos</h2>
      <ul>
        <li>
          Si el material no coincide con la publicación, el comprador no entrega el código y abre un reclamo desde su
          panel. Si el comprador no se presenta, el vendedor puede abrir un reclamo.
        </li>
        <li>
          Mientras el reclamo está abierto la operación queda en pausa. Sobrá lo analiza con las dos partes y decide si se
          devuelve el pago al comprador, si se completa la venta o si continúa el retiro.
        </li>
      </ul>

      <h2>7. Comisión y pagos al vendedor</h2>
      <ul>
        <li>Sobrá cobra al vendedor una comisión del {comision} sobre el monto de la venta, solo si se vende.</li>
        <li>Una vez confirmado el retiro, le transferimos al vendedor el monto menos la comisión.</li>
        <li>Cada parte es responsable de sus obligaciones impositivas por la operación.</li>
      </ul>

      <h2>8. Responsabilidad</h2>
      <p>
        Sobrá verifica la información de los lotes con los datos y fotos que aportan los vendedores, pero no puede
        garantizar la calidad o el estado de cada material más allá de lo publicado. El vendedor es responsable de que lo
        publicado sea cierto y el comprador de revisar el material antes de entregar el código de retiro.
      </p>

      <h2>9. Datos personales</h2>
      <p>
        Tratamos tus datos según nuestra{" "}
        <Link href="/privacidad" className="font-semibold text-marca hover:underline">Política de privacidad y cookies</Link>.
      </p>

      <h2>10. Cambios y contacto</h2>
      <p>
        Podemos actualizar estos términos; si el cambio es importante te avisamos por email. Para cualquier consulta
        escribinos a{" "}
        <a href={`mailto:${EMAIL_CONTACTO}`} className="font-semibold text-marca hover:underline">{EMAIL_CONTACTO}</a>.
        Estas condiciones se rigen por las leyes de la República Argentina.
      </p>
    </PaginaLegal>
  );
}
