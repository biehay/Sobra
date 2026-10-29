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
        ];
        for (const [archivo, ruta] of migraciones) {
          const r = await pedir(ruta, servicio);
          if (r.estado === 200) ok(`Migración ${archivo} aplicada`);
          else mal(`Falta la migración ${archivo}`, "Ejecutala en Supabase > SQL Editor (copiar, pegar y Run)");
        }
        const rol = await pedir("/rest/v1/perfiles?select=rol&rol=eq.usuario&limit=1", servicio);
        if (rol.estado === 200) ok("Migración 20261031000000_cuenta_unica.sql aplicada");
        else mal("Falta la migración 20261031000000_cuenta_unica.sql", "Ejecutala en Supabase > SQL Editor (copiar, pegar y Run)");
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
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resend}` } });
    if (r.ok) ok("La clave de Resend es correcta");
    else mal(`Resend rechazó la clave (${r.status})`, "Revisá RESEND_API_KEY en .env.local");
  } catch {
    mal("No se pudo conectar con Resend", "Revisá tu conexión a internet");
  }
} else {
  info("Sin RESEND_API_KEY: los avisos por email se muestran en la terminal en vez de enviarse");
}

const errores = resultados.filter((r) => !r).length;
console.log(errores ? `\n${errores} cosa(s) para corregir. Después de cambiar .env.local, reiniciá npm run dev.\n` : "\nTodo en orden 🎉\n");
process.exitCode = errores ? 1 : 0;
