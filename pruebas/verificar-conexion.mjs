// Revisa que .env.local esté bien completo y que la app se pueda conectar con
// Supabase (y con Resend, si está configurado). Uso: npm run verificar
import fs from "node:fs";

const resultados = [];
function ok(texto) {
  resultados.push(true);
  console.log(`✅ ${texto}`);
}
function mal(texto, solucion) {
  resultados.push(false);
  console.log(`❌ ${texto}\n   → ${solucion}`);
}
function info(texto) {
  console.log(`ℹ️  ${texto}`);
}

if (!fs.existsSync(".env.local")) {
  mal("No existe el archivo .env.local", "Crealo con: cp .env.example .env.local (y completalo)");
  process.exit(1);
}
if (typeof process.loadEnvFile !== "function") {
  mal(`Tu Node.js es muy viejo (${process.version})`, "Instalá la versión LTS de https://nodejs.org");
  process.exit(1);
}
process.loadEnvFile(".env.local");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const servicio = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const ejemplo = /TU-PROYECTO|tu-anon-key|pegá|^$/i;

console.log("\nRevisando .env.local\n");

let urlValida = false;
if (ejemplo.test(url)) {
  mal("NEXT_PUBLIC_SUPABASE_URL está vacía o es la del ejemplo", "Copiá la URL de tu proyecto (Supabase > Project Settings > Data API)");
} else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  mal(`NEXT_PUBLIC_SUPABASE_URL tiene un formato raro: "${url}"`, "Tiene que ser como https://abcdefgh.supabase.co, sin barra ni nada al final");
} else {
  urlValida = true;
  ok(`URL de Supabase: ${url}`);
}

if (ejemplo.test(anon)) mal("NEXT_PUBLIC_SUPABASE_ANON_KEY está vacía o es la del ejemplo", "Copiá la clave anon (Project Settings > API Keys > Legacy)");
if (ejemplo.test(servicio)) {
  mal("SUPABASE_SERVICE_ROLE_KEY está vacía", "Copiá la clave service_role (Project Settings > API Keys > Legacy > Reveal). Sin ella no se mandan los avisos por email");
} else if (servicio === anon) {
  mal("SUPABASE_SERVICE_ROLE_KEY es igual a la anon", "Tiene que ser la service_role, que es otra clave distinta");
}

async function pedir(ruta, clave) {
  try {
    const r = await fetch(`${url}${ruta}`, { headers: { apikey: clave, Authorization: `Bearer ${clave}` } });
    return { estado: r.status, cuerpo: await r.text() };
  } catch (e) {
    return { estado: 0, cuerpo: String(e.cause?.code ?? e.message) };
  }
}

if (urlValida) {
  console.log("\nProbando la conexión con Supabase\n");
  const salud = await pedir("/auth/v1/health", anon);
  if (salud.estado === 0) {
    mal(`No se pudo llegar a ${url} (${salud.cuerpo})`, "Revisá que la URL esté bien escrita y que tengas internet. Si es el Supabase local, corré npx supabase start");
  } else if (salud.estado === 401) {
    mal("Supabase rechazó la clave anon", "Volvé a copiar NEXT_PUBLIC_SUPABASE_ANON_KEY completa, sin espacios");
  } else if (salud.estado === 200) {
    ok("Supabase responde y acepta la clave anon");

    const tabla = await pedir("/rest/v1/lotes?select=id&limit=1", anon);
    if (tabla.estado === 200) ok("La base de datos tiene las tablas de Sobrá");
    else if (tabla.cuerpo.includes("PGRST205") || tabla.estado === 404)
      mal("Faltan las tablas de Sobrá", "Ejecutá los archivos de supabase/migrations en el SQL Editor, en orden");
    else mal(`La base respondió ${tabla.estado}: ${tabla.cuerpo.slice(0, 120)}`, "Mandale este mensaje a Claude");

    if (!ejemplo.test(servicio) && servicio !== anon) {
      const admin = await pedir("/auth/v1/admin/users?per_page=1", servicio);
      if (admin.estado === 200) {
        ok("La clave service_role es correcta");
        // Cada migración deja algo que se puede revisar desde acá.
        const migraciones = [
          ["20261030000000_codigo_retiro_y_reclamos.sql", "/rest/v1/reclamos?select=id&limit=1"],
          ["20261101000000_dos_pasos_para_todos.sql", "/rest/v1/codigos_acceso?select=id&limit=1"],
          ["20261102000000_visitas_favoritos_comprobantes.sql", "/rest/v1/favoritos?select=id&limit=1"],
          ["20261103000000_impacto_y_reputacion.sql", "/rest/v1/constancias?select=codigo&limit=1"],
          ["20261104000000_busquedas_y_baja_automatica.sql", "/rest/v1/busquedas?select=id&limit=1"],
          ["20261106000000_recomendaciones.sql", "/rest/v1/vistas_usuario?select=id&limit=1"],
          ["20261107000000_recomendaciones_afinadas.sql", "/rest/v1/vistas_usuario?select=origen&limit=1"],
          ["20261108000000_fichas_tecnicas.sql", "/rest/v1/fichas_lote?select=lote_id&limit=1"],
          ["20261110000000_estados_y_detalles.sql", "/rest/v1/lotes?select=detalles&limit=1"],
          ["20261111000000_precios_reportados.sql", "/rest/v1/precios_reportados?select=id&limit=1"],
          ["20261112000000_publicacion_automatica.sql", "/rest/v1/lotes?select=publicado_automatico&limit=1"],
          ["20261113000000_moderacion.sql", "/rest/v1/moderaciones?select=id&limit=1"],
          ["20261114000000_denuncias.sql", "/rest/v1/denuncias?select=id&limit=1"],
          ["20261115000000_sanciones_y_muestreo.sql", "/rest/v1/faltas?select=id&limit=1"],
          ["20261117000000_visitas_compartidas.sql", "/rest/v1/visitas_lote?select=compartido&limit=1"],
        ];
        for (const [archivo, ruta] of migraciones) {
          const r = await pedir(ruta, servicio);
          if (r.estado === 200) ok(`Migración ${archivo} aplicada`);
          else mal(`Falta la migración ${archivo}`, "Ejecutala en Supabase > SQL Editor (copiar, pegar y Run)");
        }
        // La de fibra óptica cambia una función: se revisa que devuelva el factor nuevo.
        const factor = await pedir(`/rest/v1/rpc/factor_co2?p_categoria=${encodeURIComponent("Fibra óptica y telecomunicaciones")}`, servicio);
        if (factor.estado === 200 && Number(factor.cuerpo) === 3.5) ok("Migración 20261109000000_fibra_optica.sql aplicada");
        else mal("Falta la migración 20261109000000_fibra_optica.sql", "Ejecutala en Supabase > SQL Editor (copiar, pegar y Run)");
        // La de ofertar sin verificación agrega una función: se revisa que exista.
        const verif = await pedir("/rest/v1/rpc/vendedor_verificado?p_usuario=00000000-0000-0000-0000-000000000000", servicio);
        if (verif.estado === 200) ok("Migración 20261116000000_ofertar_sin_verificacion.sql aplicada");
        else mal("Falta la migración 20261116000000_ofertar_sin_verificacion.sql", "Ejecutala en Supabase > SQL Editor (copiar, pegar y Run)");
        const rol = await pedir("/rest/v1/perfiles?select=rol&rol=eq.usuario&limit=1", servicio);
        if (rol.estado === 200) ok("Migración 20261031000000_cuenta_unica.sql aplicada");
        else mal("Falta la migración 20261031000000_cuenta_unica.sql", "Ejecutala en Supabase > SQL Editor (copiar, pegar y Run)");
        // Datos de ejemplo (npm run ejemplos): está bien para probar, nunca en producción.
        const usuarios = await pedir("/auth/v1/admin/users?per_page=1000", servicio);
        if (usuarios.estado === 200) {
          const deEjemplo = (JSON.parse(usuarios.cuerpo).users ?? []).filter((x) => x.email?.endsWith("@ejemplos.sobra.test")).length;
          if (deEjemplo) info(`Hay datos de EJEMPLO cargados (${deEjemplo} cuentas de ejemplo). Antes de lanzar, borralos con: npm run ejemplos:borrar`);
        }
      }
      else mal(`Supabase rechazó la clave service_role (${admin.estado})`, "Volvé a copiar SUPABASE_SERVICE_ROLE_KEY completa (Reveal > Copy)");
    }

    const ajustes = await pedir("/auth/v1/settings", anon);
    if (ajustes.estado === 200) {
      const { mailer_autoconfirm: sinCodigo, disable_signup: sinRegistro } = JSON.parse(ajustes.cuerpo);
      if (sinRegistro) mal("El registro de usuarios está desactivado en Supabase", "Authentication > Sign In / Providers > activá Allow new users to sign up");
      info(
        sinCodigo
          ? 'Confirmación por email APAGADA: los usuarios entran sin código (está bien mientras no tengas Resend)'
          : 'Confirmación por email PRENDIDA: hace falta Resend configurado como SMTP en Supabase, o los códigos no llegan',
      );
    }
  } else {
    mal(`Supabase respondió algo inesperado (${salud.estado})`, "Esperá un minuto (puede estar arrancando) y volvé a probar");
  }
}

const resend = (process.env.RESEND_API_KEY ?? "").trim();
if (resend) {
  try {
    // Una clave de "solo envío" (la recomendada) no puede listar dominios: Resend
    // responde 401 "restricted_api_key", que igual confirma que la clave existe.
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resend}` } });
    const cuerpo = r.ok ? "" : await r.text();
    if (r.ok) ok("La clave de Resend es correcta");
    else if (r.status === 401 && /restricted/i.test(cuerpo)) ok("La clave de Resend es correcta (de solo envío, como corresponde)");
    else mal(`Resend rechazó la clave (${r.status})`, "Revisá RESEND_API_KEY en .env.local: que esté completa, sin espacios ni comillas");
  } catch {
    mal("No se pudo conectar con Resend", "Revisá tu conexión a internet");
  }
} else {
  info("Sin RESEND_API_KEY: los avisos por email se muestran en la terminal en vez de enviarse");
}

const errores = resultados.filter((r) => !r).length;
console.log(errores ? `\n${errores} cosa(s) para corregir. Después de cambiar .env.local, reiniciá npm run dev.\n` : "\nTodo en orden 🎉\n");
process.exitCode = errores ? 1 : 0;
