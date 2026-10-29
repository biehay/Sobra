import type { Metadata } from "next";
import Link from "next/link";
import { EMAIL_CONTACTO, PaginaLegal, TITULAR } from "@/components/pagina-legal";
import { TASA_COMISION } from "@/lib/datos";

export const metadata: Metadata = { title: "Términos y condiciones" };

const enlace = "font-semibold text-marca hover:underline";

export default function Terminos() {
  const comision = `${Math.round(TASA_COMISION * 100)}%`;
  return (
    <PaginaLegal titulo="Términos y condiciones" actualizada="29 de octubre de 2026">
      <div className="rounded-xl border border-celeste/40 bg-celeste-claro p-5 text-petroleo">
        <p className="font-bold">Resumen</p>
        <ul className="mt-2">
          <li>Sobrá conecta a quienes tienen materiales de construcción sobrantes con compradores del AMBA.</li>
          <li>Con una sola cuenta podés vender y comprar. Para ofertar, verificamos tu cuenta.</li>
          <li>Revisamos cada lote antes de publicarlo y te sugerimos un precio.</li>
          <li>El comprador paga a Sobrá y retenemos el dinero hasta que retira y entrega el código de retiro.</li>
          <li>Publicar es gratis: cobramos al vendedor una comisión del {comision} solo si vende.</li>
          <li>Si algo sale mal, abrís un reclamo y lo resolvemos con las dos partes.</li>
        </ul>
      </div>

      <h2>1. Qué es Sobrá</h2>
      <p>
        Sobrá es una plataforma de tecnología que conecta a empresas y personas que tienen materiales de construcción
        sobrantes (vendedores) con interesados en comprarlos (compradores) en el AMBA. Sobrá no compra, no vende ni
        almacena los materiales: verifica los lotes y a los compradores, cobra el pago y lo retiene hasta que se completa
        el retiro, y coordina la operación. La compraventa es entre el vendedor y el comprador.
      </p>

      <h2>2. Aceptación y cambios</h2>
      <ul>
        <li>Al crear una cuenta aceptás estos términos, la <Link href="/privacidad" className={enlace}>Política de privacidad</Link> y la <Link href="/devoluciones" className={enlace}>Política de devoluciones y reclamos</Link>.</li>
        <li>
          Si cambiamos algo que afecte tus derechos u obligaciones, te avisamos en la plataforma y por email con al menos
          10 días corridos de anticipación.
        </li>
        <li>
          Podés cerrar tu cuenta cuando quieras. Eso no cancela las operaciones en curso ni las obligaciones pendientes con
          Sobrá o con otros usuarios.
        </li>
      </ul>

      <h2>3. Quién puede usar Sobrá</h2>
      <ul>
        <li>Personas mayores de edad con capacidad legal para contratar.</li>
        <li>Quien use Sobrá en nombre de una empresa tiene que estar autorizado para representarla.</li>
        <li>
          No pueden usar Sobrá las personas o empresas inhabilitadas antes por incumplir estos términos, ni quienes figuren
          en listas de sanciones nacionales o internacionales.
        </li>
      </ul>

      <h2>4. Registro y cuenta</h2>
      <ul>
        <li>Los datos de tu cuenta tienen que ser reales, exactos y estar actualizados. Sos responsable de que lo sean.</li>
        <li>Podemos pedirte información adicional (por ejemplo, tu CUIT o documentación) para verificar tu identidad.</li>
        <li>La cuenta es personal e intransferible: no se puede vender, prestar ni ceder.</li>
        <li>
          Cuidá tu contraseña y el acceso a tu email: cada vez que ingresás desde un dispositivo nuevo te mandamos un código a
          ese email para confirmar que sos vos.
        </li>
        <li>
          Si notás un acceso que no hiciste vos, cambiá tu contraseña y avisanos enseguida a{" "}
          <a href={`mailto:${EMAIL_CONTACTO}`} className={enlace}>{EMAIL_CONTACTO}</a>.
        </li>
        <li>
          Podemos rechazar un registro o dar de baja una cuenta cuando haya motivos fundados: incumplimiento de estos
          términos, pedido de una autoridad, la ley o para prevenir fraudes que afecten a otros usuarios.
        </li>
      </ul>

      <h2>5. Publicar un lote</h2>
      <ul>
        <li>Solo se pueden publicar materiales propios, nuevos, sin uso o usados en buen estado.</li>
        <li>No se aceptan escombros, residuos, materiales peligrosos ni productos de origen dudoso.</li>
        <li>Las fotos y la descripción tienen que mostrar el estado real del material.</li>
        <li>Revisamos cada lote antes de publicarlo y podemos pedir cambios o rechazarlo.</li>
        <li>El precio de publicación lo confirmamos con vos al revisarlo. Publicar es gratis.</li>
        <li>
          <strong>Baja automática de precio (opcional):</strong> si la activás, nos autorizás a bajar el precio de publicación
          el porcentaje que elegiste cada semana que el lote pase sin venderse, hasta el precio mínimo que fijaste. El mínimo
          no se muestra a los compradores. La podés desactivar o cambiar cuando quieras editando el lote.
        </li>
      </ul>

      <h2>6. Ofertas y compra</h2>
      <ul>
        <li>Para ofertar, Sobrá tiene que haber verificado tu cuenta.</li>
        <li>Las ofertas son por el lote completo. Cuando el vendedor acepta una, el lote queda reservado.</li>
        <li>El comprador paga antes del retiro. Sobrá retiene el pago hasta que se completa el retiro.</li>
        <li>Los datos de contacto y la dirección de retiro se comparten recién cuando el pago está confirmado.</li>
        <li>No está permitido cerrar por fuera de Sobrá una operación que empezó en Sobrá.</li>
        <li>
          <strong>Lo busco:</strong> podés guardar hasta 10 búsquedas y te avisamos por email cuando se publique un lote que
          coincida. El texto de lo que buscás (sin tu nombre ni tus datos) se muestra a los vendedores en “Lo que se está
          buscando”, así que no escribas datos personales ahí. Podemos borrar búsquedas que no correspondan.
        </li>
      </ul>

      <h2>7. Pago protegido y código de retiro</h2>
      <ul>
        <li>Al confirmarse el pago, el comprador recibe un código de retiro de 6 dígitos.</li>
        <li>
          En el retiro, el comprador revisa el material y, <strong>si está todo bien</strong>, le da el código al vendedor.
          Entregar el código significa aceptar el material.
        </li>
        <li>El retiro corre por cuenta del comprador, salvo que se haya acordado un flete con Sobrá.</li>
      </ul>

      <h2>8. Reclamos y devoluciones</h2>
      <p>
        Si el material no coincide con la publicación o la otra parte no cumple, abrís un reclamo desde tu panel. Mientras
        está abierto, la operación queda en pausa y Sobrá decide con las dos partes si se devuelve el pago, si se completa la
        venta o si continúa el retiro. El detalle, los plazos y tus derechos como consumidor están en la{" "}
        <Link href="/devoluciones" className={enlace}>Política de devoluciones y reclamos</Link>.
      </p>

      <h2>9. Comisión, facturación y retenciones</h2>
      <ul>
        <li>Sobrá cobra al vendedor una comisión del {comision} sobre el monto de la venta, solo si se vende.</li>
        <li>Una vez confirmado el retiro, le transferimos al vendedor el monto menos la comisión, con su comprobante.</li>
        <li>
          Podemos cambiar la comisión avisando con la anticipación del punto 2. También podemos bajarla temporalmente por
          promociones.
        </li>
        <li>
          Del pago que retenemos podemos descontar: la comisión, los reembolsos que correspondan por un reclamo resuelto y
          otras deudas exigibles que el usuario tenga con Sobrá por su actividad en la plataforma. Siempre indicamos el
          concepto y el monto.
        </li>
        <li>Facturamos la comisión con los datos fiscales que tengas cargados en tu cuenta.</li>
        <li>Cada parte es responsable de sus obligaciones impositivas por la operación.</li>
      </ul>

      <h2>10. Información de la actividad, reputación e impacto</h2>
      <p>
        Al usar Sobrá se genera información sobre la actividad: lotes publicados, precios, ofertas, ventas y visitas.
        Podemos usarla para que la plataforma funcione, para mejorar el precio sugerido y para estadísticas, siempre de forma
        agregada cuando se trate de otros usuarios. Nunca vendemos tus datos personales.
      </p>
      <ul>
        <li>
          <strong>Reputación:</strong> se calcula automáticamente con los hechos de tus operaciones (ventas completadas sin
          reclamos por el material, compras retiradas, tiempo de respuesta a las ofertas). No se puede escribir, editar ni
          comprar. Se muestra a otros usuarios en tus lotes y tus ofertas, sin tu nombre ni tus datos de contacto.
        </li>
        <li>
          <strong>Peso de los lotes:</strong> el vendedor declara el peso aproximado y Sobrá lo revisa antes de publicar. Declarar
          un peso falso a propósito es un incumplimiento de estos términos.
        </li>
        <li>
          <strong>Constancias de material recuperado:</strong> podés emitir una constancia con el material que vendiste o
          compraste y el CO₂ evitado. El CO₂ es una estimación hecha con factores de referencia públicos, explicada en{" "}
          <Link href="/impacto" className={enlace}>Cómo calculamos el impacto</Link>. La constancia la emite Sobrá con sus propios
          datos: no es una certificación de un organismo acreditado ni reemplaza la documentación que exija la normativa de
          residuos. Quien tenga su código puede verificarla y ver a nombre de quién está y sus números.
        </li>
      </ul>

      <h2>11. Sanciones</h2>
      <p>
        Si un usuario incumple la ley o estos términos, podemos advertirle, pausar o dar de baja sus publicaciones, y
        suspender, restringir o inhabilitar su cuenta en forma temporal o definitiva.
      </p>

      <h2>12. Responsabilidad</h2>
      <p>
        Sobrá responde por las fallas en la prestación de su servicio en la medida en que le sean imputables y con el
        alcance que fijan las leyes vigentes. Verificamos los lotes con los datos y fotos que aportan los vendedores, pero no
        podemos garantizar el estado de cada material más allá de lo publicado: el vendedor responde por que lo publicado sea
        cierto y el comprador por revisar el material antes de entregar el código de retiro.
      </p>

      <h2>13. Propiedad intelectual</h2>
      <ul>
        <li>
          La marca Sobrá, el logo, el diseño, los textos y el software de la plataforma son de Sobrá. Usar la plataforma no
          da permiso para usarlos.
        </li>
        <li>
          Las fotos y descripciones de tus lotes siguen siendo tuyas. Nos das permiso para mostrarlas en Sobrá mientras el
          lote esté publicado y para promocionarlo.
        </li>
        <li>
          No podés publicar contenido que infrinja derechos de terceros. Si pasa, podemos bajar la publicación y aplicar las
          sanciones del punto 11.
        </li>
      </ul>

      <h2>14. Indemnidad</h2>
      <p>
        Cada usuario mantiene indemne a Sobrá, y a quienes la dirigen y trabajan en ella, frente a reclamos de terceros o de
        organismos públicos que tengan origen en su propia actividad en la plataforma (por ejemplo, por publicar material
        ajeno o información falsa).
      </p>

      <h2>15. Uso automatizado</h2>
      <p>
        Está prohibido usar bots, scrapers, crawlers u otros sistemas automatizados (incluidos los basados en inteligencia
        artificial) para entrar a Sobrá, operar, copiar o extraer sus contenidos o datos sin nuestra autorización, y hacer
        cualquier cosa que afecte la estabilidad del sitio. Podemos bloquearlos y tomar las medidas legales que correspondan.
      </p>

      <h2>16. Datos personales</h2>
      <p>
        Tratamos tus datos según la{" "}
        <Link href="/privacidad" className={enlace}>Política de privacidad y cookies</Link> y la Ley 25.326.
      </p>

      <h2>17. Ley aplicable, jurisdicción y contacto</h2>
      <p>
        Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia se resuelve ante los
        tribunales ordinarios competentes de la Ciudad Autónoma de Buenos Aires, salvo que una norma de orden público (por
        ejemplo, la Ley de Defensa del Consumidor) indique otra cosa.
      </p>
      <p>
        Titular de Sobrá: {TITULAR.nombre}, CUIT {TITULAR.cuit}, con domicilio en {TITULAR.domicilio}. Para cualquier
        consulta, escribinos a <a href={`mailto:${EMAIL_CONTACTO}`} className={enlace}>{EMAIL_CONTACTO}</a> o entrá al{" "}
        <Link href="/ayuda" className={enlace}>Centro de ayuda</Link>.
      </p>
    </PaginaLegal>
  );
}
