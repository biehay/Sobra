import crypto from "node:crypto";
// Recorrido completo de Sobrá en un navegador real, contra el Supabase local:
// aviso de cookies, páginas legales, registro con código, admin con dos pasos,
// lote con fotos, revisión, ofertas, pago, código de retiro, reclamo,
// liquidación, perfil y recuperación de contraseña. Ver README ("Recorrido completo").
//
// Uso: npm run test:recorrido  (con `npx supabase start` y `npm run dev` corriendo)
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:54324";
const OUT = process.argv[2] ?? "pruebas/capturas";
fs.mkdirSync(OUT, { recursive: true });
// Clave service_role del Supabase local (la imprime `npx supabase status`).
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Tiene que ser la misma CRON_SECRET con la que arrancó la app.
const CRON_SECRET = process.env.CRON_SECRET ?? "secreto-de-prueba";
if (!SERVICE_ROLE) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (la del Supabase local)");
const CLAVE = "clave-segura-123";

const problemas = [];
const pasos = [];
let n = 0;

// Lectura/escritura directa en la base local, salteando permisos (solo para preparar la prueba).
async function api(ruta, opciones = {}) {
  const r = await fetch(`http://127.0.0.1:54321${ruta}`, {
    ...opciones,
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", ...opciones.headers },
  });
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function captura(pg, nombre) {
  n += 1;
  await pg.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${nombre}.png`, fullPage: true });
}

function paso(texto) {
  pasos.push(texto);
  console.log("✓", texto);
}

function esperar(cond, msg) {
  if (!cond) throw new Error(`FALLÓ: ${msg}`);
}

const confirmaciones = [];
const NAVEGADOR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

// Espera a que aparezca un texto en el log del servidor (por ejemplo un email sin enviar).
async function enLog(texto, desde) {
  for (let i = 0; i < 40; i++) {
    if (fs.readFileSync(LOG).subarray(desde).toString().includes(texto)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function nuevaPagina(browser, quien, ancho = 1280, conAvisoVisto = true) {
  // Navegador "normal": la app no cuenta visitas de robots ni de navegadores headless.
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, userAgent: NAVEGADOR });
  if (conAvisoVisto) await ctx.addCookies([{ name: "sobra_cookies", value: "ok", url: BASE }]);
  const pg = await ctx.newPage();
  pg.on("dialog", (d) => {
    confirmaciones.push(d.message());
    d.accept();
  });
  pg.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) problemas.push(`[${quien}] consola: ${m.text()}`);
  });
  pg.on("pageerror", (e) => problemas.push(`[${quien}] error JS: ${e.message}`));
  pg.on("response", (r) => {
    if (r.status() >= 500) problemas.push(`[${quien}] HTTP ${r.status()} en ${r.url()}`);
  });
  return pg;
}

// --- Emails (Mailpit) ---------------------------------------------------------
async function ultimoEmail(para, asuntoContiene, despuesDe = 0) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`).then((r) => r.json());
    const m = r.messages.find((m) => m.Subject.includes(asuntoContiene) && new Date(m.Created).getTime() > despuesDe);
    if (m) return fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el email "${asuntoContiene}" a ${para}`);
}

// --- Código de acceso (segundo paso) -----------------------------------------
// Sin Resend, el servidor muestra el código en su log (SOBRA_CODIGOS_EN_CONSOLA=1);
// SOBRA_LOG es el archivo donde se guarda la salida de `npm start`.
const LOG = process.env.SOBRA_LOG;
if (!LOG) throw new Error("Falta SOBRA_LOG: el archivo con la salida del servidor (ver README)");
function marcaLog() {
  return fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
}
async function codigoDeAcceso(email, desde) {
  for (let i = 0; i < 40; i++) {
    const nuevo = fs.readFileSync(LOG).subarray(desde).toString();
    const encontrados = [...nuevo.matchAll(new RegExp(`Código de acceso para ${email.replace(".", "\\.")}: (\\d{6})`, "g"))];
    if (encontrados.length) return encontrados.at(-1)[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No apareció el código de acceso de ${email} en el log`);
}

// Escribe el código en los 6 casilleros (se envía solo al completarse).
async function escribirCodigo(pg, codigo) {
  await pg.locator("input[aria-label='Dígito 1']").click();
  await pg.keyboard.type(codigo, { delay: 30 });
}

// --- Fotos de prueba (con un bloque EXIF con "GPS" para verificar que se borra)
async function crearFotos(browser) {
  const pg = await browser.newPage();
  const fotos = [];
  for (const [i, color] of ["#b45309", "#57534e"].entries()) {
    await pg.setContent(`<body style="margin:0;background:${color};display:grid;place-items:center;height:100vh;font:bold 80px sans-serif;color:white">Porcelanato ${i + 1}</body>`);
    await pg.setViewportSize({ width: 2400, height: 1600 });
    const jpg = await pg.screenshot({ type: "jpeg" });
    const marca = Buffer.from("Exif\0\0GPS-34.6037,-58.3816-UBICACION-SECRETA");
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (marca.length + 2) >> 8, (marca.length + 2) & 0xff]), marca]);
    const ruta = `${OUT}/foto${i + 1}.jpg`;
    fs.writeFileSync(ruta, Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]));
    fotos.push(ruta);
  }
  await pg.close();
  return fotos;
}

// --- Registro con código por email -------------------------------------------
async function registrar(pg, { nombre, empresa, email, zona = "GBA Sur", telefono, volver }) {
  await pg.goto(`${BASE}/registro${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`);
  esperar(!(await pg.locator("text=Quiero comprar").count()), "el registro es un solo formulario (sin elegir comprador o vendedor)");
  await pg.fill("#nombre", nombre);
  if (empresa) await pg.fill("#empresa", empresa);
  await pg.fill("#telefono", telefono);
  await pg.selectOption("#zona", zona);
  await pg.fill("#email", email);
  await pg.fill("#password", CLAVE);
  const antes = Date.now() - 1000;
  await pg.click("button:has-text('Crear cuenta')");
  await pg.waitForURL("**/verificar**");
  const correo = await ultimoEmail(email, "Tu código de Sobrá", antes);
  const codigo = correo.Subject.match(/\d{6}/)[0];
  esperar(correo.HTML.includes(codigo), "el email de verificación muestra el código");
  return codigo;
}

async function ingresar(pg, email, volver = "/panel") {
  await pg.goto(`${BASE}/ingresar?volver=${encodeURIComponent(volver)}`);
  await pg.fill("#email", email);
  await pg.fill("#password", CLAVE);
  await pg.click("button:has-text('Ingresar')");
}

// Hace la acción y espera a que la dirección cambie e incluya el patrón
// (?ok= o ?error=), aunque la dirección anterior ya tuviera uno.
async function tras(pg, patron, accion) {
  const antes = pg.url();
  await accion();
  await pg.waitForURL((u) => u.href !== antes && u.href.includes(patron));
}

async function aviso(pg) {
  return (await pg.locator("[data-aviso]").first().textContent().catch(() => "")) ?? "";
}

const browser = await chromium.launch({
  // Por defecto usa el Chromium de Playwright (`npx playwright install chromium`).
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
  // 1. Visitante ------------------------------------------------------------
  const anon = await nuevaPagina(browser, "visitante", 390, false);
  await anon.goto(BASE);
  esperar(await anon.locator("text=Usamos solo las cookies necesarias").isVisible(), "se ve el aviso de cookies");
  await captura(anon, "portada-aviso-cookies-celular");
  await anon.click("button:has-text('Entendido')");
  await anon.reload();
  esperar(!(await anon.locator("text=Usamos solo las cookies necesarias").isVisible()), "el aviso no vuelve después de Entendido");
  await anon.setViewportSize({ width: 1280, height: 900 });
  for (const ruta of ["/privacidad", "/devoluciones", "/ayuda", "/terminos"]) {
    const r = await anon.goto(BASE + ruta);
    esperar(r.status() === 200, ruta + " responde");
  }
  await captura(anon, "terminos");
  // Botón de arrepentimiento: desde el pie de página y sin cuenta.
  await anon.click("footer a:has-text('Botón de arrepentimiento')");
  await anon.waitForURL("**/arrepentimiento");
  await anon.fill("#nombre", "Carla Consumidora");
  await anon.fill("#email", "carla@consumidora.test");
  await anon.fill("#operacion", "Porcelanato pagado ayer");
  const marcaArr = marcaLog();
  await tras(anon, "ok=", () => anon.click("button:has-text('Revocar mi compra')"));
  esperar(/ARR-\d{6}/.test(await aviso(anon)), "el botón de arrepentimiento da un código de trámite");
  esperar(await enLog("Para: carla@consumidora.test · Recibimos tu pedido de arrepentimiento", marcaArr), "le llega el código por email al consumidor");
  await anon.goto(BASE + "/privacidad#cookies");
  await captura(anon, "privacidad");
  await anon.goto(BASE + "/salir");
  esperar(anon.url() === BASE + "/", "abrir /salir lleva al inicio");
  await anon.goto(BASE);
  await captura(anon, "portada-vacia");
  await anon.goto(`${BASE}/lotes`);
  await anon.goto(`${BASE}/como-funciona`);
  esperar(anon.url().endsWith("/#como-funciona"), "cómo funciona redirige a la portada");
  const r404 = await anon.goto(`${BASE}/lotes/00000000-0000-0000-0000-000000000000`);
  esperar(r404.status() === 404, "lote inexistente da 404");
  await captura(anon, "404");
  await anon.goto(`${BASE}/panel`);
  esperar(anon.url().includes("/ingresar?volver=%2Fpanel"), "panel sin sesión pide ingresar");
  await anon.goto(`${BASE}/ingresar`);
  await anon.fill("#email", "nadie@sobra.test");
  await anon.fill("#password", "incorrecta");
  await tras(anon, "error=", () => anon.click("button:has-text('Ingresar')"));
  esperar((await aviso(anon)).includes("incorrectos"), "login con datos incorrectos muestra error");
  paso("Visitante: portada, catálogo, páginas legales y de ayuda, botón de arrepentimiento, 404, protección de /panel y login incorrecto");

  // 2. Registro del vendedor con código -------------------------------------
  const vend = await nuevaPagina(browser, "vendedor");
  await vend.goto(`${BASE}/registro`);
  await vend.fill("#nombre", "Marta Gómez");
  await vend.fill("#empresa", "Constructora del Sur");
  await vend.fill("#telefono", "1234 5678");
  await vend.selectOption("#zona", "GBA Sur");
  await vend.fill("#email", "marta@constructora.test");
  await vend.fill("#password", CLAVE);
  await tras(vend, "error=", () => vend.click("button:has-text('Crear cuenta')"));
  esperar((await aviso(vend)).includes("código de área"), "el registro rechaza un teléfono inválido");
  await vend.fill("#nombre", "Marta Gómez");
  await vend.fill("#telefono", "11 2345 6789");
  await vend.selectOption("#zona", "GBA Sur");
  await vend.fill("#email", "marta@constructora.test");
  await vend.fill("#password", "clave1234");
  esperar((await vend.locator("#password-reglas li", { hasText: "Un signo" }).getAttribute("class")).includes("stone"), "la lista marca que falta el signo");
  await tras(vend, "error=", () => vend.click("button:has-text('Crear cuenta')"));
  esperar((await aviso(vend)).includes("un signo"), "el registro rechaza una contraseña sin signo");
  const codigoV = await registrar(vend, {
    nombre: "Marta Gómez", empresa: "Constructora del Sur", email: "marta@constructora.test", telefono: "11 2345 6789",
    volver: "/panel/vendedor/lotes/nuevo",
  });
  await captura(vend, "verificar-codigo");
  await tras(vend, "error=", () => escribirCodigo(vend, codigoV === "000000" ? "111111" : "000000"));
  esperar((await aviso(vend)).includes("no es correcto"), "código incorrecto muestra error");
  // Pedir otro código enseguida: Supabase pide esperar un minuto y la app lo avisa.
  await tras(vend, "error=", () => vend.click("button:has-text('pedí otro código')"));
  esperar((await aviso(vend)).includes("Esperá un minuto"), "reenvío inmediato avisa que hay que esperar");
  await vend.waitForTimeout(61000);
  await tras(vend, "ok=", () => vend.click("button:has-text('pedí otro código')"));
  const codigoV2 = (await ultimoEmail("marta@constructora.test", "Tu código de Sobrá", Date.now() - 5000)).Subject.match(/\d{6}/)[0];
  await escribirCodigo(vend, codigoV2);
  await vend.waitForURL("**/panel/vendedor/lotes/nuevo");
  await vend.goto(`${BASE}/panel/vendedor`);
  esperar(await vend.locator("nav a:has-text('Mis compras')").isVisible(), "el panel tiene pestañas de ventas y compras");
  await captura(vend, "panel-vendedor-vacio");
  paso("Vendedor: registro, código incorrecto, reenvío de código y confirmación");

  // 3. Compradores ---------------------------------------------------------
  const comp = await nuevaPagina(browser, "comprador", 390);
  const codigoC = await registrar(comp, { nombre: "Juan Pérez", email: "juan@contratista.test", telefono: "11 3456 7890", zona: "CABA" });
  await escribirCodigo(comp, codigoC);
  await comp.waitForURL("**/panel/comprador**");
  await captura(comp, "panel-comprador-sin-verificar-celular");

  const comp2 = await nuevaPagina(browser, "comprador2");
  const codigoC2 = await registrar(comp2, { nombre: "Lucía Díaz", email: "lucia@arquitecta.test", telefono: "11 4567 8901" });
  await escribirCodigo(comp2, codigoC2);
  await comp2.waitForURL("**/panel/comprador**");
  await comp.click("nav a:has-text('Mis ventas')");
  await comp.waitForURL("**/panel/vendedor");
  esperar(await comp.locator("a:has-text('Publicar lote')").first().isVisible(), "un comprador también puede publicar con la misma cuenta");
  paso("Dos usuarios más registrados (uno desde celular); la misma cuenta sirve para comprar y vender");

  // 4. Admin --------------------------------------------------------------
  const adm = await nuevaPagina(browser, "admin");
  const codigoA = await registrar(adm, { nombre: "Admin Sobrá", email: "admin@sobra.test", telefono: "11 0000 0000" });
  await escribirCodigo(adm, codigoA);
  await adm.waitForURL("**/panel/**");
  const { users } = await api("/auth/v1/admin/users?per_page=100");
  const idAdmin = users.find((u) => u.email === "admin@sobra.test").id;
  await api(`/rest/v1/perfiles?id=eq.${idAdmin}`, { method: "PATCH", body: JSON.stringify({ rol: "admin", verificado: true }) });
  await adm.goto(`${BASE}/admin`);
  await adm.waitForSelector("h1:has-text('Administración')");
  await captura(adm, "admin-inicial");
  paso("Admin: la sesión confirmada con el código del email ya entra al panel de admin");

  // 5. Vendedor carga un lote con fotos ------------------------------------
  const fotos = await crearFotos(browser);
  await vend.goto(`${BASE}/panel/vendedor/lotes/nuevo`);
  await vend.fill("#titulo", "Porcelanato 60x60 gris, 45 m² + pegamento");
  await vend.selectOption("#categoria", "Cerámicos y porcelanatos");
  await vend.selectOption("#condicion", "nuevo");
  await vend.fill("input[aria-label='Material']", "Porcelanato 60x60 gris");
  await vend.fill("input[aria-label='Cantidad']", "45");
  await vend.fill("input[aria-label='Unidad']", "m²");
  await vend.click("button:has-text('Agregar material')");
  await vend.locator("input[aria-label='Material']").nth(1).fill("Pegamento para porcelanato 30 kg");
  await vend.locator("input[aria-label='Cantidad']").nth(1).fill("12");
  await vend.locator("input[aria-label='Unidad']").nth(1).fill("bolsas");
  await vend.fill("#descripcion", "Sobró de una obra en Lanús. Cajas cerradas.");
  await vend.setInputFiles("input[type=file]", fotos);
  await vend.waitForFunction(() => document.querySelectorAll("img[alt^='Foto']").length === 2, null, { timeout: 30000 });
  await vend.fill("#precio_lista", "900000");
  await vend.fill("#precio_pedido", "500000");
  await vend.fill("#peso_kg", "900");
  // Sugerencia con IA: sin ANTHROPIC_API_KEY (la prueba no la usa, cuesta plata) avisa qué falta.
  await vend.click("button:has-text('Sugerir precio con IA')");
  await vend.waitForSelector("text=ANTHROPIC_API_KEY");
  await vend.waitForSelector("text=sugerimos alrededor de");
  await vend.selectOption("#zona", "GBA Sur");
  await vend.fill("#localidad", "Lanús");
  await vend.fill("#direccion", "Av. Hipólito Yrigoyen 4500, Lanús");
  await vend.fill("#horarios", "Lun a vie de 8 a 17");
  await captura(vend, "form-lote");
  await vend.click("button:has-text('Enviar a revisión')");
  await vend.waitForURL("**/panel/vendedor?ok=**");
  // Las fotos subidas no tienen el EXIF con GPS.
  const [{ fotos: rutasFotos }] = await api("/rest/v1/lotes?select=fotos&limit=1");
  for (const ruta of rutasFotos) {
    const bytes = Buffer.from(await fetch(`http://127.0.0.1:54321/storage/v1/object/public/lotes/${ruta}`).then((r) => r.arrayBuffer()));
    esperar(bytes.length > 1000, "la foto se subió");
    esperar(!bytes.toString("latin1").includes("UBICACION-SECRETA"), "la foto subida no tiene GPS");
  }
  await captura(vend, "panel-vendedor-en-revision");
  paso("Vendedor: lote con 2 materiales y 2 fotos enviado a revisión; las fotos llegaron sin GPS");

  // 6. Admin observa, vendedor corrige, admin publica ----------------------
  await adm.goto(`${BASE}/admin`);
  await adm.fill("textarea[name=nota]", "Sumá una foto de las cajas cerradas, por favor.");
  await tras(adm, "ok=", () => adm.click("button:has-text('Devolver con observaciones')"));
  await vend.goto(`${BASE}/panel/vendedor`);
  await vend.waitForSelector("text=Sumá una foto de las cajas");
  await vend.click("a:has-text('Editar')");
  await vend.waitForSelector("text=Observaciones de Sobrá");
  await captura(vend, "editar-lote-con-observaciones");
  await vend.click("button:has-text('Enviar a revisión')");
  await vend.waitForURL("**/panel/vendedor?ok=**");
  await adm.goto(`${BASE}/admin`);
  await adm.fill("input[name=precio_publicado]", "480000");
  await captura(adm, "admin-revisar-lote");
  await tras(adm, "ok=", () => adm.click("button:has-text('Aprobar y publicar')"));
  paso("Admin: devolvió el lote con observaciones, el vendedor lo reenvió y el admin lo publicó a $480.000");

  // 7. Catálogo y detalle -------------------------------------------------
  await anon.goto(`${BASE}/`);
  await captura(anon, "portada-con-lote");
  await anon.goto(`${BASE}/lotes?q=porcelanato&categoria=${encodeURIComponent("Cerámicos y porcelanatos")}&zona=GBA+Sur&orden=barato`);
  esperar((await anon.locator("a[href^='/lotes/']").count()) === 1, "el filtro encuentra el lote");
  // Buscador y desplegables del header.
  await anon.goto(`${BASE}/como-funciona`);
  await anon.fill("#buscar-escritorio", "porcelanato");
  await anon.press("#buscar-escritorio", "Enter");
  await anon.waitForURL("**/lotes?q=porcelanato");
  esperar((await anon.locator("a[href^='/lotes/']").count()) === 1, "el buscador del header encuentra el lote");
  await anon.click("button[aria-label='Categorías']");
  await captura(anon, "header-categorias");
  await anon.click("header a:has-text('Cerámicos y porcelanatos')");
  await anon.waitForURL("**categoria=**");
  esperar((await anon.locator("a[href^='/lotes/']").count()) === 1, "el desplegable de categorías filtra");
  await anon.click("button[aria-label='Ofertas']");
  await anon.click("header a:has-text('Mayor descuento')");
  await anon.waitForURL("**orden=descuento");
  esperar((await anon.locator("a[href^='/lotes/']").count()) === 1, "Ofertas > Mayor descuento muestra el lote rebajado");
  // Sin cuenta, el corazón invita a crearla y vuelve al mismo lugar.
  await anon.locator("button[aria-label='Guardar en favoritos']").first().click();
  await anon.waitForURL("**/registro?motivo=favorito**");
  esperar((await anon.textContent("main")).includes("te avisamos si baja de precio"), "el registro dice para qué es la cuenta");
  esperar((await anon.getAttribute("a:has-text('Ingresá')", "href")).includes("volver="), "Ingresá conserva la página de vuelta");
  await anon.goto(`${BASE}/lotes?q=inexistente`);
  esperar(await anon.locator("text=No encontramos lotes").isVisible(), "filtro sin resultados");
  await anon.goto(`${BASE}/lotes`);
  await anon.click("a[href^='/lotes/']");
  await anon.waitForSelector("text=Qué incluye el lote");
  const loteUrl = anon.url();
  esperar((await anon.textContent("body")).includes("47% menos"), "muestra el descuento sobre el precio de lista");
  await captura(anon, "detalle-lote-visitante");
  paso("Catálogo: portada, buscador del header, categorías, ofertas, filtros y detalle con descuento");

  // 8. Ofertas -----------------------------------------------------------
  await comp.goto(loteUrl);
  await comp.waitForSelector("text=Tu cuenta está en verificación");
  await captura(comp, "detalle-comprador-sin-verificar-celular");
  await adm.goto(`${BASE}/admin`);
  for (const email of ["juan@contratista.test", "lucia@arquitecta.test"]) {
    await adm.goto(`${BASE}/admin`);
    const fila = adm.locator("tr", { hasText: email === "juan@contratista.test" ? "Juan Pérez" : "Lucía Díaz" });
    await tras(adm, "ok=", () => fila.locator("button:has-text('Verificar')").click());
  }
  await comp.goto(loteUrl);
  await comp.fill("#monto", "450000");
  await comp.fill("#mensaje", "Puedo retirar esta semana");
  await tras(comp, "ok=", () => comp.click("button:has-text('Enviar oferta')"));
  await comp.goto(loteUrl);
  await tras(comp, "error=", () => comp.click("button:has-text('Enviar oferta')"));
  esperar((await aviso(comp)).includes("Ya tenés una oferta pendiente"), "no deja duplicar ofertas pendientes");
  // Favoritos: Lucía guarda el lote y lo ve en su panel.
  await comp2.goto(loteUrl);
  await comp2.click("button:has-text('Guardar en favoritos')");
  await comp2.waitForSelector("button:has-text('Guardado en favoritos')");
  await comp2.goto(`${BASE}/panel/favoritos`);
  esperar((await comp2.textContent("main")).includes("Porcelanato"), "el lote guardado aparece en Favoritos");
  await captura(comp2, "favoritos");
  await comp2.goto(loteUrl);
  await comp2.fill("#monto", "400000");
  await tras(comp2, "ok=", () => comp2.click("button:has-text('Enviar oferta')"));
  await vend.goto(loteUrl);
  esperar((await vend.textContent("body")).includes("Este es tu lote"), "el vendedor no puede ofertar por su lote");
  paso("Ofertas: comprador sin verificar bloqueado, admin verificó, favorito guardado, 2 ofertas, sin duplicados");

  // 9. Vendedor acepta ---------------------------------------------------
  await vend.goto(`${BASE}/panel/vendedor`);
  const visitas = Number((await vend.textContent("main")).match(/(\d+) visitas? en los últimos 7 días/)?.[1] ?? 0);
  esperar(visitas >= 3, `el vendedor ve las visitas de su lote (${visitas})`);
  await captura(vend, "panel-vendedor-ofertas");
  await tras(vend, "ok=", () => vend.locator(".tarjeta", { hasText: "$ 450.000" }).locator("button:has-text('Aceptar')").click());
  await comp2.goto(`${BASE}/panel/comprador`);
  esperar((await comp2.textContent("body")).includes("Rechazada"), "la otra oferta queda rechazada");
  await comp.goto(`${BASE}/panel/comprador`);
  esperar((await comp.textContent("body")).includes("SOBRA.PAGOS"), "el comprador ve los datos para transferir");
  await captura(comp, "comprador-oferta-aceptada-celular");
  await anon.goto(loteUrl);
  esperar((await anon.textContent("body")).includes("reservado"), "el lote figura reservado");
  paso("Vendedor aceptó: lote reservado, la otra oferta rechazada, el comprador ve cómo pagar");

  // 10. Pago y retiro ----------------------------------------------------
  await adm.goto(`${BASE}/admin`);
  await tras(adm, "ok=", () => adm.click("button:has-text('Confirmar pago')"));
  await comp.goto(`${BASE}/panel/comprador`);
  const codigoRetiro = (await comp.locator(".font-mono.text-4xl").textContent()).trim();
  esperar(/^\d{6}$/.test(codigoRetiro), "el comprador ve su código de retiro");
  esperar((await comp.textContent("body")).includes("Hipólito Yrigoyen"), "el comprador ve la dirección de retiro");
  await captura(comp, "comprador-pagado-codigo-celular");
  const hrefWa = await comp.locator("a[href*='wa.me']").first().getAttribute("href");
  esperar(hrefWa.startsWith("https://wa.me/5491123456789"), "el WhatsApp del vendedor sale en formato internacional: " + hrefWa);
  esperar(await comp.locator("main a:has-text('Mis datos')").isVisible(), "en el celular se llega a Mis datos desde el panel");
  await vend.goto(`${BASE}/panel/vendedor`);
  esperar(!(await vend.textContent("body")).includes(codigoRetiro), "el vendedor NO ve el código");
  esperar((await vend.textContent("body")).includes("Juan Pérez"), "el vendedor ve los datos del comprador");
  await vend.fill("input[name=codigo]", "999999" === codigoRetiro ? "111111" : "999999");
  await tras(vend, "error=", () => vend.click("button:has-text('Confirmar retiro')"));
  await captura(vend, "vendedor-codigo-incorrecto");
  await vend.fill("input[name=codigo]", `${codigoRetiro.slice(0, 3)} ${codigoRetiro.slice(3)}`);
  await tras(vend, "ok=", () => vend.click("button:has-text('Confirmar retiro')"));
  esperar((await aviso(vend)).includes("Retiro confirmado"), "retiro confirmado con el código");
  paso("Pago confirmado, código visible solo para el comprador, código incorrecto rechazado y retiro completado");

  // 11. Liquidación -------------------------------------------------------
  await adm.goto(`${BASE}/admin`);
  await captura(adm, "admin-liquidacion-pendiente");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n");
  await adm.setInputFiles("input[name=comprobante]", { name: "transferencia.pdf", mimeType: "application/pdf", buffer: pdf });
  await tras(adm, "ok=", () => adm.click("button:has-text('Marcar transferido')"));
  esperar((await aviso(adm)).includes("con su comprobante"), "el admin registra la transferencia con el comprobante");
  await vend.goto(`${BASE}/panel/vendedor`);
  esperar((await vend.textContent("body")).includes("Te transferimos"), "el vendedor ve la transferencia");
  await vend.goto(`${BASE}/panel/cobros`);
  const cobros = (await vend.textContent("main")).replace(/\s/g, " ");
  esperar(cobros.includes("Porcelanato") && cobros.includes("$ 396.000"), "Cobros muestra la transferencia con el neto");
  await captura(vend, "cobros");
  const hrefComprobante = await vend.locator("a:has-text('Ver comprobante')").getAttribute("href");
  const firmado = await vend.context().request.get(BASE + hrefComprobante, { maxRedirects: 0 });
  const destino = firmado.headers()["location"] ?? "";
  esperar(destino.includes("/storage/v1/object/sign/comprobantes/"), "el comprobante se abre con un link firmado: " + destino);
  const archivo = await vend.context().request.get(destino);
  esperar((await archivo.body()).toString().startsWith("%PDF"), "el vendedor descarga el comprobante");
  const ajeno = await comp.context().request.get(BASE + hrefComprobante, { maxRedirects: 0 });
  esperar(!(ajeno.headers()["location"] ?? "").includes("/storage/"), "el comprador no puede abrir el comprobante del vendedor");
  const planilla = await (await vend.context().request.get(`${BASE}/panel/cobros/descargar`)).text();
  esperar(planilla.includes("Porcelanato") && planilla.includes("396000"), "la planilla de cobros trae la transferencia");
  await anon.goto(loteUrl);
  esperar((await anon.textContent("body")).includes("vendido"), "el lote figura vendido");
  paso("Liquidación con comprobante: el vendedor lo ve en Cobros, lo descarga y baja la planilla; el comprador no puede abrirlo");

  // Impacto y constancia verificable --------------------------------------
  await vend.goto(`${BASE}/panel/impacto`);
  esperar((await vend.textContent("main")).includes("900 kg"), "el vendedor ve los kilos que no fueron a residuos");
  await comp.goto(`${BASE}/panel/impacto`);
  esperar((await comp.textContent("main")).includes("702 kg"), "el comprador ve el CO₂ evitado (900 kg × 0,78)");
  await comp.click("button:has-text('Emitir constancia')");
  await comp.waitForURL("**/constancia/**");
  const codigoConstancia = comp.url().split("/constancia/")[1];
  esperar((await comp.textContent("main")).includes("Juan Pérez"), "la constancia está a nombre del comprador");
  await captura(comp, "constancia-celular");
  await anon.goto(`${BASE}/impacto?codigo=${codigoConstancia.toLowerCase()}`);
  await anon.waitForURL(`**/constancia/${codigoConstancia}`);
  esperar((await anon.textContent("main")).includes("Constancia válida"), "cualquiera puede verificar la constancia con el código");
  await anon.goto(`${BASE}/impacto?codigo=NOEXISTE123`);
  esperar((await aviso(anon)).includes("No encontramos"), "un código inventado no se valida");
  await anon.goto(BASE);
  esperar((await anon.textContent("main")).includes("de material ya no fue a residuos"), "la portada muestra el impacto de Sobrá");
  await anon.goto(loteUrl);
  esperar((await anon.textContent("main")).includes("Sobre el vendedor"), "el lote muestra la reputación del vendedor");
  paso("Impacto: kilos y CO₂ por operación, constancia emitida y verificada por un tercero, reputación del vendedor en el lote");

  // "Lo busco": Juan no encuentra inodoros y pide que le avisen.
  await comp.goto(`${BASE}/lotes?q=inodoro`);
  await comp.click("a:has-text('Avisame cuando aparezca')");
  await comp.waitForURL("**/panel/busquedas?q=inodoro**");
  esperar((await comp.inputValue("#texto")) === "inodoro", "el catálogo pasa la búsqueda a Lo busco");
  await tras(comp, "ok=", () => comp.click("button:has-text('Avisame cuando aparezca')"));
  await anon.goto(`${BASE}/buscados`);
  esperar((await anon.textContent("main")).includes("inodoro"), "los vendedores ven lo que se está buscando");

  // 12. Segundo lote con reclamo -----------------------------------------
  await vend.goto(`${BASE}/panel/vendedor/lotes/nuevo`);
  await vend.fill("#titulo", "Inodoros Ferrum blancos x 4");
  await vend.selectOption("#categoria", "Sanitarios y grifería");
  await vend.fill("input[aria-label='Material']", "Inodoro largo Ferrum");
  await vend.fill("input[aria-label='Cantidad']", "4");
  await vend.setInputFiles("input[type=file]", fotos[0]);
  await vend.waitForSelector("img[alt='Foto 1']", { timeout: 30000 });
  await vend.fill("#precio_pedido", "200000");
  await vend.fill("#peso_kg", "100");
  await vend.selectOption("#zona", "GBA Sur");
  // Baja automática opcional: 5% por semana, sin bajar de $150.000.
  await vend.check("text=Bajar el precio solo si no se vende");
  await vend.selectOption("#baja_semanal_pct", "5");
  await vend.fill("#precio_minimo", "150000");
  await tras(vend, "ok=", () => vend.click("button:has-text('Guardar borrador')"));
  await vend.locator("div.p-4", { hasText: "Inodoros Ferrum" }).locator("a:has-text('Editar')").click();
  await vend.waitForSelector("#titulo");
  await tras(vend, "error=", () => vend.click("button:has-text('Enviar a revisión')"));
  esperar((await aviso(vend)).includes("dirección de retiro"), "no deja enviar a revisión sin dirección de retiro");
  await vend.fill("#direccion", "Camino General Belgrano 1200, Lanús");
  await tras(vend, "ok=", () => vend.click("button:has-text('Enviar a revisión')"));
  const marcaBusqueda = marcaLog();
  await adm.goto(`${BASE}/admin`);
  await tras(adm, "ok=", () => adm.click("button:has-text('Aprobar y publicar')"));
  esperar(await enLog("Para: juan@contratista.test · Apareció lo que buscabas: Inodoros Ferrum", marcaBusqueda), "a quien lo buscaba le llega el aviso del lote nuevo");
  await comp.goto(`${BASE}/panel/busquedas`);
  esperar((await comp.textContent("main")).includes("Ya hay 1 lote que coincide"), "Lo busco muestra el lote que coincide");
  // Baja de precio: Lucía lo guarda, el vendedor lo baja y, al republicarlo, le llega el aviso.
  await comp2.goto(`${BASE}/lotes`);
  await comp2.locator(".relative", { hasText: "Inodoros Ferrum" }).locator("button[aria-label='Guardar en favoritos']").click();
  await comp2.waitForSelector("button[aria-label='Quitar de favoritos']");
  await vend.goto(`${BASE}/panel/vendedor`);
  await vend.locator("div.p-4", { hasText: "Inodoros Ferrum" }).locator("a:has-text('Editar')").click();
  await vend.fill("#precio_pedido", "180000");
  await tras(vend, "ok=", () => vend.click("button:has-text('Enviar a revisión')"));
  let marcaPrecio = marcaLog();
  await adm.goto(`${BASE}/admin`);
  await tras(adm, "ok=", () => adm.click("button:has-text('Aprobar y publicar')"));
  esperar(await enLog("Para: lucia@arquitecta.test · Bajó de precio: Inodoros Ferrum", marcaPrecio), "a quien lo guardó le llega el aviso de baja de precio");
  await comp2.goto(`${BASE}/panel/favoritos`);
  esperar((await comp2.textContent("main")).replace(/\s/g, " ").includes("Bajó $ 20.000"), "Favoritos muestra cuánto bajó");
  await comp2.click("button[aria-label^='Mi cuenta']");
  esperar(await comp2.isVisible("text=1 favorito bajó de precio"), "el menú del usuario avisa que bajó un favorito");
  await captura(comp2, "favorito-bajo-de-precio");
  // Baja automática: pasa una semana sin venderse y la tarea diaria lo baja 5%.
  const [{ id: loteInodoros }] = await api("/rest/v1/lotes?select=id&titulo=like.Inodoros*");
  esperar((await api(`/rest/v1/lote_precio_minimo?lote_id=eq.${loteInodoros}`))[0]?.precio_minimo === 150000, "se guardó el precio mínimo");
  await api(`/rest/v1/lotes?id=eq.${loteInodoros}`, { method: "PATCH", body: JSON.stringify({ publicado_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), ultima_baja_at: null }) });
  esperar((await fetch(`${BASE}/api/tareas/bajas-de-precio`)).status === 401, "la tarea de bajas no corre sin la clave");
  marcaPrecio = marcaLog();
  const tarea = await (await fetch(`${BASE}/api/tareas/bajas-de-precio`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })).json();
  esperar(tarea.bajaron === 1, "la tarea diaria bajó el lote: " + JSON.stringify(tarea));
  esperar(await enLog("Para: lucia@arquitecta.test · Bajó de precio: Inodoros Ferrum", marcaPrecio), "la baja automática le avisa a quien lo guardó");
  await anon.goto(`${BASE}/lotes/${loteInodoros}`);
  const detalleInodoros = (await anon.textContent("main")).replace(/\s/g, " ");
  esperar(detalleInodoros.includes("$ 171.000") && detalleInodoros.includes("Precio en baja"), "el lote muestra el precio nuevo y que está en baja");
  esperar(!detalleInodoros.includes("150.000"), "el precio mínimo no se muestra");
  await comp.goto(`${BASE}/lotes`);
  await comp.click("a:has-text('Inodoros Ferrum')");
  await tras(comp, "ok=", () => comp.click("button:has-text('Enviar oferta')"));
  await vend.goto(`${BASE}/panel/vendedor`);
  await tras(vend, "ok=", () => vend.locator(".tarjeta", { hasText: "Inodoros" }).locator("button:has-text('Aceptar')").click());
  await adm.goto(`${BASE}/admin`);
  await tras(adm, "ok=", () => adm.click("button:has-text('Confirmar pago')"));
  await comp.goto(`${BASE}/panel/comprador`);
  const tarjeta = comp.locator(".tarjeta", { hasText: "Inodoros" });
  await tarjeta.locator("summary").click();
  await tarjeta.locator("textarea[name=detalle]").fill("Dos inodoros tienen la tapa rota, no coincide con las fotos");
  await tras(comp, "ok=", () => tarjeta.locator("button:has-text('Abrir reclamo')").click());
  await captura(comp, "comprador-reclamo-abierto-celular");
  await vend.goto(`${BASE}/panel/vendedor`);
  esperar((await vend.textContent("body")).includes("Reclamo abierto"), "el vendedor ve el reclamo");
  esperar((await vend.locator(".tarjeta", { hasText: "Inodoros" }).locator("input[name=codigo]").count()) === 0, "con reclamo abierto no se puede cargar el código");
  await adm.goto(`${BASE}/admin`);
  await captura(adm, "admin-reclamo");
  await adm.fill("textarea[name=resolucion]", "Las fotos del comprador muestran las tapas rotas. Devolvemos el pago.");
  await tras(adm, "ok=", () => adm.click("button:has-text('Devolver el pago al comprador')"));
  await comp.goto(`${BASE}/panel/comprador`);
  esperar((await comp.textContent("body")).includes("Pago devuelto"), "el comprador ve el reembolso");
  await vend.goto(`${BASE}/panel/vendedor`);
  esperar((await vend.textContent("body")).includes("Pausado"), "el lote queda pausado");
  await captura(vend, "vendedor-tras-reclamo");
  paso("Segundo lote: Lo busco avisó a quien lo buscaba, baja de precio manual y automática avisadas, oferta, pago, reclamo y devolución");

  // Resumen semanal: solo a quien tiene algo nuevo, y con baja en un clic.
  let marcaResumen = marcaLog();
  const resumen = await (await fetch(`${BASE}/api/tareas/resumen-semanal`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })).json();
  esperar(resumen.enviados >= 1, "el resumen semanal se mandó: " + JSON.stringify(resumen));
  esperar(await enLog("Para: marta@constructora.test · ", marcaResumen), "a la vendedora le llega el resumen (tiene visitas)");
  const [{ id: idMarta }] = await api("/rest/v1/perfiles?select=id&nombre=eq.Marta%20G%C3%B3mez");
  const firma = crypto.createHmac("sha256", CRON_SECRET).update(`baja-resumen:${idMarta}`).digest("hex").slice(0, 32);
  await anon.goto(`${BASE}/resumen-baja?u=${idMarta}&f=${firma}`);
  await anon.click("button:has-text('no me lo manden más')");
  await anon.waitForSelector("text=no te lo mandamos más");
  await anon.goto(`${BASE}/resumen-baja?u=${idMarta}&f=${"0".repeat(32)}`);
  await anon.click("button:has-text('no me lo manden más')");
  await anon.waitForSelector("text=El link no es válido");
  marcaResumen = marcaLog();
  await fetch(`${BASE}/api/tareas/resumen-semanal`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  esperar(!(await enLog("Para: marta@constructora.test · ", marcaResumen)), "después de la baja no le llega más");
  paso("Resumen semanal: solo a quien tiene novedades, con baja desde el email (firmada)");

  // 13. Perfil, contraseña y recuperación --------------------------------
  await comp.goto(`${BASE}/panel/perfil`);
  await comp.fill("#empresa", "Pérez Construcciones");
  await tras(comp, "ok=", () => comp.click("button:has-text('Guardar cambios')"));
  esperar((await comp.inputValue("#empresa")) === "Pérez Construcciones", "se guardan los datos del perfil");
  await captura(comp, "perfil-celular");
  await comp2.context().clearCookies();
  await comp2.goto(`${BASE}/recuperar`);
  await comp2.fill("#email", "lucia@arquitecta.test");
  const antesRec = Date.now() - 1000;
  await comp2.click("button:has-text('Enviar link')");
  await comp2.waitForURL("**/ingresar?ok=**");
  const rec = await ultimoEmail("lucia@arquitecta.test", "nueva contraseña", antesRec);
  const link = rec.HTML.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
  await comp2.goto(link);
  await comp2.waitForURL((u) => u.pathname === "/seguridad/verificar" && u.searchParams.get("volver") === "/nueva-clave");
  let marca = marcaLog();
  await tras(comp2, "ok=", () => comp2.click("button:has-text('Enviarme el código')"));
  await escribirCodigo(comp2, await codigoDeAcceso("lucia@arquitecta.test", marca));
  await comp2.waitForURL("**/nueva-clave");
  await comp2.fill("#password", "otra-clave-456");
  await comp2.fill("#confirmacion", "otra-clave-456");
  await comp2.click("button:has-text('Guardar contraseña')");
  await comp2.waitForURL("**/panel/comprador**");
  await comp2.context().clearCookies();
  await comp2.goto(`${BASE}/ingresar`);
  await comp2.fill("#email", "lucia@arquitecta.test");
  await comp2.fill("#password", "otra-clave-456");
  marca = marcaLog();
  await comp2.click("button:has-text('Ingresar')");
  await comp2.waitForURL("**/seguridad/verificar**");
  await escribirCodigo(comp2, await codigoDeAcceso("lucia@arquitecta.test", marca));
  await comp2.waitForURL("**/panel/comprador**");
  paso("Perfil editado; recuperación de contraseña con código por email y login con la nueva y su código");

  // 14. Admin vuelve a entrar: le pide el código ----------------------------
  await adm.context().clearCookies();
  marca = marcaLog();
  await ingresar(adm, "admin@sobra.test", "/admin");
  await adm.waitForURL("**/seguridad/verificar**");
  await captura(adm, "pide-codigo-email");
  const codigoAdm = await codigoDeAcceso("admin@sobra.test", marca);
  // Con la contraseña sola no entra al panel de admin.
  await adm.goto(`${BASE}/admin`);
  esperar(adm.url().includes("/seguridad/verificar"), "sin el código no entra al panel de admin");
  await tras(adm, "error=", () => escribirCodigo(adm, codigoAdm === "000000" ? "111111" : "000000"));
  esperar((await aviso(adm)).includes("no es correcto"), "rechaza un código de acceso incorrecto");
  await escribirCodigo(adm, codigoAdm);
  await adm.waitForURL("**/admin");
  await adm.waitForSelector("text=Volumen transaccionado");
  await captura(adm, "admin-final");
  paso("Admin: al volver a ingresar se le pide el código del email; uno incorrecto se rechaza");

  // 15. Cerrar sesión ------------------------------------------------------
  // El menú del usuario (el círculo del encabezado) muestra el resumen y tiene "Salir".
  await vend.click("button[aria-label^='Mi cuenta']");
  await vend.waitForSelector("text=Ganado en");
  esperar(await vend.isVisible("text=Te debemos"), "el menú del usuario muestra lo que se le debe");
  await captura(vend, "menu-usuario");
  await vend.click("button:has-text('Salir')");
  await vend.waitForURL(BASE + "/");
  await vend.goto(`${BASE}/panel/vendedor`);
  esperar(vend.url().includes("/ingresar"), "después de salir, el panel pide ingresar");
  paso("Cerrar sesión");
} catch (e) {
  problemas.push(`CORTE: ${e.message}`);
  console.error(e);
} finally {
  await browser.close();
  console.log("\n=== CONFIRMACIONES PEDIDAS:", confirmaciones.length);
  for (const c of [...new Set(confirmaciones)]) console.log("   ?", c);
  console.log("\n=== PASOS OK:", pasos.length);
  console.log("=== PROBLEMAS:", problemas.length);
  for (const p of [...new Set(problemas)]) console.log(" -", p);
  process.exitCode = problemas.length ? 1 : 0;
}
