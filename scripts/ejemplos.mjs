// Datos de ejemplo para probar Sobrá con mercadería "de verdad".
//
//   npm run ejemplos           carga vendedores, lotes con fotos y algo de actividad
//   npm run ejemplos:borrar    borra todo lo de ejemplo y deja la base limpia
//
// Todo lo de ejemplo cuelga de cuentas con email @ejemplos.sobra.test. Al borrar
// esas cuentas se borran en cascada sus lotes, fotos, ofertas, favoritos,
// visitas, fichas y comprobantes. Nunca toca nada de otras cuentas, salvo las
// ofertas o favoritos que hayas hecho vos SOBRE lotes de ejemplo (se van con el lote).
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const DOMINIO = "@ejemplos.sobra.test";
const accion = process.argv[2];
if (!["cargar", "borrar"].includes(accion)) {
  console.log("Uso: npm run ejemplos  ó  npm run ejemplos:borrar");
  process.exit(1);
}
if (!fs.existsSync(".env.local")) {
  console.log("❌ No existe .env.local. Corré esto desde la carpeta del proyecto.");
  process.exit(1);
}
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !servicio) {
  console.log("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local (revisá con npm run verificar).");
  process.exit(1);
}
const db = createClient(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } });

// ---------------------------------------------------------------------------
// Cuentas de ejemplo
// ---------------------------------------------------------------------------
const VENDEDORES = [
  { clave: "corralon", nombre: "Ricardo Gómez", empresa: "Corralón San Martín", zona: "GBA Norte", localidad: "San Martín", telefono: "11 4000 0001" },
  { clave: "constructora", nombre: "Paula Ferreyra", empresa: "Ferreyra Construcciones", zona: "CABA", localidad: "Palermo", telefono: "11 4000 0002" },
  { clave: "electricista", nombre: "Diego Sosa", empresa: "Sosa Instalaciones", zona: "GBA Oeste", localidad: "Morón", telefono: "11 4000 0003" },
  { clave: "arquitecta", nombre: "Carla Benítez", empresa: "Estudio Benítez", zona: "GBA Sur", localidad: "Lomas de Zamora", telefono: "11 4000 0004" },
  { clave: "obra", nombre: "Martín Ruiz", empresa: "Ruiz & Hijos", zona: "La Plata y alrededores", localidad: "City Bell", telefono: "11 4000 0005" },
  { clave: "telecom", nombre: "Andrea Molina", empresa: "Molina Redes y Fibra", zona: "GBA Norte", localidad: "Vicente López", telefono: "11 4000 0006" },
];
// Compradores de ejemplo: solo dejan visitas y favoritos para que el algoritmo
// tenga "quienes vieron esto también vieron" y popularidad.
const COMPRADORES = ["Lucas", "Sofía", "Tomás", "Valentina", "Martina"].map((n, i) => ({
  clave: `comprador${i + 1}`,
  nombre: `${n} (comprador de ejemplo)`,
  zona: ["CABA", "GBA Norte", "GBA Sur", "GBA Oeste", "GBA Norte"][i],
}));

// ---------------------------------------------------------------------------
// Lotes de ejemplo: [vendedor, título, categoría, estado, materiales, precio lista, precio, kg, días publicado, baja %, descripción]
// ---------------------------------------------------------------------------
const u = (nombre, cantidad, unidad) => ({ nombre, cantidad, unidad });
const LOTES = [
  ["constructora", "Porcelanato 60x60 gris símil cemento, 38 m²", "Cerámicos y porcelanatos", "nuevo", [u("Porcelanato 60x60 gris rectificado", 38, "m2")], 760000, 420000, 870, 2, null, "Sobrante de un departamento en Palermo. Cajas cerradas, mismo lote de fabricación."],
  ["constructora", "Porcelanato 60x120 calacatta, 22 m²", "Cerámicos y porcelanatos", "nuevo", [u("Porcelanato 60x120 calacatta pulido", 22, "m2")], 990000, 610000, 560, 9, 5, "Quedó de un baño y un living. Cajas cerradas."],
  ["arquitecta", "Cerámico 45x45 beige para piso, 30 m²", "Cerámicos y porcelanatos", "sin_uso", [u("Cerámico 45x45 beige", 30, "m2")], 270000, 150000, 540, 5, null, "Cajas abiertas pero sin usar. Ideal para quincho o depósito."],
  ["corralon", "Pegamento para porcelanato x 20 bolsas de 30 kg", "Cemento, cal y áridos", "nuevo", [u("Pegamento para porcelanato", 20, "bolsas 30 kg")], 280000, 190000, 600, 3, null, "Bolsas en pallet, bajo techo. Vence en 8 meses."],
  ["corralon", "Pastina gris x 15 kg", "Cemento, cal y áridos", "nuevo", [u("Pastina gris", 15, "kg")], 45000, 28000, 15, 6, null, "Sobrante de stock, bolsas de 1 kg."],
  ["corralon", "Cemento portland x 40 bolsas", "Cemento, cal y áridos", "nuevo", [u("Cemento portland 50 kg", 40, "bolsas")], 520000, 360000, 2000, 1, null, "Pallet completo. Se retira con camión o flete."],
  ["obra", "Cal hidratada x 25 bolsas", "Cemento, cal y áridos", "sin_uso", [u("Cal hidratada 25 kg", 25, "bolsas")], 160000, 95000, 625, 12, 5, "Quedó de la obra gruesa. Guardadas bajo techo."],
  ["obra", "Ladrillos huecos 12x18x33 x 600 unidades", "Cemento, cal y áridos", "nuevo", [u("Ladrillo hueco 12x18x33", 600, "u")], 690000, 430000, 4200, 4, null, "En pallets, sin roturas."],
  ["corralon", "Hierro del 8 x 60 barras", "Hierros y perfiles", "nuevo", [u("Barra de hierro ADN 8 mm x 12 m", 60, "u")], 540000, 340000, 284, 7, null, "Barras de 12 m. Hace falta flete largo."],
  ["obra", "Malla sima 15x15 x 12 paneles", "Hierros y perfiles", "sin_uso", [u("Malla sima 15x15 4,2 mm", 12, "u")], 360000, 210000, 300, 15, null, "Sobraron de una platea."],
  ["electricista", "Cable unipolar 2,5 mm x 8 rollos de 100 m", "Electricidad e iluminación", "nuevo", [u("Cable unipolar 2,5 mm² rojo", 4, "rollos 100 m"), u("Cable unipolar 2,5 mm² celeste", 4, "rollos 100 m")], 480000, 300000, 200, 2, null, "Rollos cerrados, marca reconocida, certificados IRAM."],
  ["electricista", "Caño corrugado 3/4 x 10 rollos", "Electricidad e iluminación", "nuevo", [u("Caño corrugado ignífugo 3/4\" x 25 m", 10, "rollos")], 95000, 60000, 30, 8, null, "Ignífugo, para embutir en losa o mampostería."],
  ["electricista", "Tablero con 12 térmicas y disyuntor", "Electricidad e iluminación", "sin_uso", [u("Tablero embutir 24 bocas", 1, "u"), u("Térmica bipolar 16 A", 12, "u"), u("Disyuntor 40 A 30 mA", 1, "u")], 310000, 185000, 9, 10, null, "Lo compramos para una obra que se suspendió."],
  ["constructora", "Paneles LED 60x60 x 20 unidades", "Electricidad e iluminación", "nuevo", [u("Panel LED 60x60 48 W luz fría", 20, "u")], 440000, 250000, 60, 13, 5, "Para cielorraso desmontable. En caja."],
  ["arquitecta", "Inodoros cortos con mochila x 3", "Sanitarios y grifería", "nuevo", [u("Inodoro corto blanco", 3, "u"), u("Mochila de colgar", 3, "u")], 540000, 330000, 75, 4, null, "Sin uso, en caja original."],
  ["arquitecta", "Grifería monocomando para baño x 4", "Sanitarios y grifería", "nuevo", [u("Monocomando de lavatorio cromado", 4, "u")], 360000, 210000, 8, 6, null, "Quedaron de un edificio terminado."],
  ["constructora", "Bachas de apoyar blancas x 5", "Sanitarios y grifería", "nuevo", [u("Bacha de apoyar redonda 40 cm", 5, "u")], 260000, 150000, 40, 11, null, "Loza blanca, sin detalles."],
  ["corralon", "Caño termofusión 20 mm x 40 tiras", "Plomería y gas", "nuevo", [u("Caño termofusión agua fría/caliente 20 mm x 4 m", 40, "u")], 170000, 105000, 40, 3, null, "Tiras de 4 m. Hay también codos y tees en otro lote."],
  ["corralon", "Accesorios termofusión 20 mm (codos, tees, cuplas)", "Plomería y gas", "nuevo", [u("Codo 90° 20 mm", 60, "u"), u("Tee 20 mm", 40, "u"), u("Cupla 20 mm", 50, "u")], 90000, 52000, 5, 3, null, "Bolsas cerradas."],
  ["obra", "Tanque de agua 1000 litros tricapa", "Plomería y gas", "sin_uso", [u("Tanque tricapa 1000 l", 1, "u")], 290000, 185000, 25, 18, 5, "Sin instalar. Incluye flotante."],
  ["constructora", "Placas de yeso (durlock) x 40", "Aislantes y durlock", "nuevo", [u("Placa de yeso estándar 12,5 mm 1,20x2,40", 40, "u")], 520000, 320000, 1150, 5, null, "Placas en pallet, sin humedad."],
  ["constructora", "Perfiles montante y solera para durlock x 80", "Aislantes y durlock", "nuevo", [u("Montante 70 mm x 2,60 m", 50, "u"), u("Solera 70 mm x 2,60 m", 30, "u")], 230000, 140000, 120, 5, null, "Galvanizados, sin golpes."],
  ["arquitecta", "Lana de vidrio 50 mm x 10 rollos", "Aislantes y durlock", "nuevo", [u("Lana de vidrio con aluminio 50 mm x 18 m²", 10, "rollos")], 380000, 230000, 90, 9, null, "Para techo o tabiques. En su bolsa."],
  ["obra", "Membrana asfáltica 4 mm x 8 rollos", "Pinturas e impermeabilizantes", "nuevo", [u("Membrana asfáltica con aluminio 4 mm x 10 m²", 8, "rollos")], 300000, 175000, 280, 6, null, "Sobraron de una terraza."],
  ["arquitecta", "Látex interior blanco x 6 baldes de 20 l", "Pinturas e impermeabilizantes", "nuevo", [u("Látex interior blanco mate 20 l", 6, "baldes")], 420000, 250000, 180, 2, null, "Baldes cerrados, vencimiento 2028."],
  ["constructora", "Puerta placa 80 cm con marco x 4", "Aberturas", "nuevo", [u("Puerta placa para pintar 80 cm con marco de chapa", 4, "u")], 520000, 300000, 140, 14, 5, "Mano derecha. Embaladas."],
  ["obra", "Ventana de aluminio 150x110 con vidrio", "Aberturas", "sin_uso", [u("Ventana corrediza aluminio blanco 150x110 con vidrio", 2, "u")], 640000, 380000, 50, 7, null, "Cambió el proyecto y no se colocaron."],
  ["corralon", "Placas fenólicas 18 mm x 20", "Maderas y placas", "usado_buen_estado", [u("Fenólico 18 mm 1,22x2,44", 20, "u")], 480000, 210000, 650, 10, null, "Usadas una vez para encofrado, en buen estado."],
  ["obra", "Tirantes de pino 2x4 x 50", "Maderas y placas", "nuevo", [u("Tirante pino cepillado 2x4\" x 3,05 m", 50, "u")], 260000, 160000, 400, 4, null, "Secos, bajo techo."],
  ["electricista", "Hormigonera 130 litros", "Herramientas y equipos", "usado_buen_estado", [u("Hormigonera eléctrica 130 l", 1, "u")], 650000, 320000, 70, 8, 5, "Funciona perfecto, terminamos la obra."],
  ["electricista", "Bobina de fibra óptica monomodo 2 km", "Fibra óptica y telecomunicaciones", "nuevo", [u("Cable de fibra óptica monomodo 12 hilos", 2000, "m")], 900000, 520000, 160, 3, null, "Sobrante de un tendido de telecomunicaciones. Bobina sellada."],
  ["electricista", "Conectores SC/APC y cajas de empalme", "Fibra óptica y telecomunicaciones", "nuevo", [u("Conector SC/APC rápido", 200, "u"), u("Caja de empalme 24 fibras", 6, "u")], 260000, 150000, 12, 3, null, "Para instalaciones FTTH."],
  // Fibra óptica y telecomunicaciones.
  ["telecom", "Cable drop FTTH x 6 bobinas de 1 km", "Fibra óptica y telecomunicaciones", "nuevo", [u("Cable drop FTTH 1 fibra con mensajero", 6000, "m")], 780000, 450000, 120, 2, null, "Bobinas cerradas, sobrante de un despliegue en Vicente López."],
  ["telecom", "ONU GPON con WiFi x 25 unidades", "Fibra óptica y telecomunicaciones", "nuevo", [u("ONU GPON con WiFi doble banda", 25, "u")], 1250000, 690000, 15, 4, 5, "En caja, con fuente. Quedaron de un proyecto que se achicó."],
  ["telecom", "Splitters PLC 1x8 SC/APC x 40", "Fibra óptica y telecomunicaciones", "nuevo", [u("Splitter PLC 1x8 conectorizado SC/APC", 40, "u")], 480000, 280000, 6, 6, null, "Conectorizados, en su bolsa."],
  ["telecom", "Patchcords SC/APC monomodo 3 m x 150", "Fibra óptica y telecomunicaciones", "nuevo", [u("Patchcord SC/APC-SC/APC monomodo 3 m", 150, "u")], 300000, 165000, 8, 5, null, "Sin uso, en bolsas de 10."],
  ["telecom", "Cajas NAP exterior 16 puertos x 12", "Fibra óptica y telecomunicaciones", "nuevo", [u("Caja NAP exterior 16 puertos", 12, "u")], 540000, 320000, 30, 9, null, "Para poste o fachada. Incluyen bandeja de empalme."],
  ["telecom", "Fusionadora de fibra óptica con cortadora", "Fibra óptica y telecomunicaciones", "usado_buen_estado", [u("Fusionadora de fibra óptica", 1, "u"), u("Cortadora de precisión", 1, "u")], 3200000, 1650000, 8, 7, null, "Funciona perfecto, con estuche y batería. La cambiamos por un modelo nuevo."],
  ["telecom", "Herrajes y preformados para fibra x 300", "Fibra óptica y telecomunicaciones", "nuevo", [u("Preformado para cable ADSS", 200, "u"), u("Herraje de suspensión", 100, "u")], 360000, 210000, 90, 11, null, "Sobrante de un tendido aéreo."],
  ["electricista", "Cable UTP Cat 6 x 4 cajas de 305 m", "Fibra óptica y telecomunicaciones", "nuevo", [u("Cable UTP Cat 6 exterior", 1220, "m")], 620000, 360000, 48, 5, null, "Cajas cerradas, para redes de datos."],
  ["telecom", "Rack de pared 12U con patcheras", "Fibra óptica y telecomunicaciones", "sin_uso", [u("Rack de pared 12U", 1, "u"), u("Patchera Cat 6 24 puertos", 2, "u")], 420000, 240000, 28, 8, null, "Armado pero sin instalar."],
];

// ---------------------------------------------------------------------------
// Fotos de ejemplo: una ilustración por rubro, con la leyenda "Foto de ejemplo".
// ---------------------------------------------------------------------------
const COLORES = {
  "Cerámicos y porcelanatos": ["#8d99a6", "#c9d1d9"],
  "Cemento, cal y áridos": ["#9c8f7a", "#d8cfbf"],
  "Hierros y perfiles": ["#4b5563", "#9ca3af"],
  "Electricidad e iluminación": ["#0369a1", "#7dd3fc"],
  "Sanitarios y grifería": ["#00b4d8", "#e6f8fc"],
  "Plomería y gas": ["#1e3a5f", "#93c5fd"],
  "Aislantes y durlock": ["#d6d3d1", "#fafaf9"],
  "Pinturas e impermeabilizantes": ["#e10600", "#ffeceb"],
  Aberturas: ["#062a3a", "#bae6fd"],
  "Maderas y placas": ["#92400e", "#fcd34d"],
  "Herramientas y equipos": ["#b45309", "#fde68a"],
  "Fibra óptica y telecomunicaciones": ["#0b3a53", "#22d3ee"],
  Otros: ["#062a3a", "#00b4d8"],
};

function dibujo(categoria, oscuro, claro) {
  const r = [];
  switch (categoria) {
    case "Cerámicos y porcelanatos":
      for (let x = 0; x < 6; x++) for (let y = 0; y < 4; y++) r.push(`<rect x="${90 + x * 172}" y="${70 + y * 150}" width="164" height="142" fill="${(x + y) % 2 ? claro : "#fff"}" opacity=".9"/>`);
      break;
    case "Cemento, cal y áridos":
      for (let f = 0; f < 3; f++) for (let c = 0; c < 4 - f; c++) r.push(`<rect x="${210 + f * 95 + c * 200}" y="${470 - f * 150}" width="180" height="130" rx="30" fill="${claro}" stroke="${oscuro}" stroke-width="6"/>`);
      break;
    case "Hierros y perfiles":
      for (let i = 0; i < 9; i++) r.push(`<rect x="60" y="${110 + i * 55}" width="1080" height="22" rx="11" fill="${i % 2 ? claro : "#e5e7eb"}"/>`);
      break;
    case "Electricidad e iluminación":
      for (const [cx, cy] of [[380, 350], [820, 350]]) for (let k = 0; k < 6; k++) r.push(`<circle cx="${cx}" cy="${cy}" r="${200 - k * 28}" fill="none" stroke="${k % 2 ? claro : "#fff"}" stroke-width="16"/>`);
      break;
    case "Sanitarios y grifería":
      r.push(`<ellipse cx="600" cy="420" rx="300" ry="170" fill="#fff"/><ellipse cx="600" cy="400" rx="220" ry="110" fill="${claro}"/><rect x="560" y="120" width="80" height="170" rx="20" fill="#fff"/>`);
      break;
    case "Plomería y gas":
      for (let i = 0; i < 5; i++) r.push(`<line x1="100" y1="${150 + i * 100}" x2="1100" y2="${150 + i * 100}" stroke="${i % 2 ? claro : "#fff"}" stroke-width="44" stroke-linecap="round"/>`);
      break;
    case "Aislantes y durlock":
      for (let i = 0; i < 6; i++) r.push(`<rect x="${140 + i * 30}" y="${100 + i * 30}" width="760" height="420" fill="#fff" stroke="${oscuro}" stroke-width="4"/>`);
      break;
    case "Pinturas e impermeabilizantes":
      for (let i = 0; i < 3; i++) r.push(`<rect x="${200 + i * 290}" y="200" width="230" height="300" rx="20" fill="#fff"/><ellipse cx="${315 + i * 290}" cy="200" rx="115" ry="30" fill="${claro}"/>`);
      break;
    case "Aberturas":
      r.push(`<rect x="300" y="90" width="600" height="480" fill="${claro}" stroke="#fff" stroke-width="30"/><line x1="600" y1="90" x2="600" y2="570" stroke="#fff" stroke-width="24"/>`);
      break;
    case "Maderas y placas":
      for (let i = 0; i < 7; i++) r.push(`<rect x="80" y="${90 + i * 75}" width="1040" height="62" rx="6" fill="${i % 2 ? claro : "#fde68a"}" opacity=".95"/>`);
      break;
    case "Fibra óptica y telecomunicaciones":
      // Hilos de fibra que brillan en la punta.
      for (let i = 0; i < 7; i++) {
        const y = 140 + i * 70;
        r.push(`<path d="M60 ${y} C 380 ${y - 90}, 700 ${y + 90}, 1080 ${y - 20}" fill="none" stroke="${i % 2 ? claro : "#e0f7ff"}" stroke-width="10" stroke-linecap="round"/>`);
        r.push(`<circle cx="1080" cy="${y - 20}" r="16" fill="#fff"/><circle cx="1080" cy="${y - 20}" r="30" fill="${claro}" opacity=".35"/>`);
      }
      break;
    default:
      for (let i = 0; i < 5; i++) r.push(`<circle cx="${250 + i * 175}" cy="340" r="${70 + (i % 2) * 30}" fill="${i % 2 ? claro : "#fff"}"/>`);
  }
  return r.join("");
}


async function foto(lote, variante) {
  const [oscuro, claro] = COLORES[lote.categoria] ?? COLORES.Otros;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${oscuro}"/><stop offset="1" stop-color="${variante ? claro : oscuro}" stop-opacity="${variante ? 0.8 : 0.7}"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <g transform="${variante ? "translate(600 330) rotate(-8) translate(-600 -330)" : ""}">${dibujo(lote.categoria, oscuro, claro)}</g>
    <rect x="420" y="770" width="360" height="64" rx="32" fill="#062a3a" opacity=".85"/>
    <text x="600" y="812" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#fff">Foto de ejemplo</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

// ---------------------------------------------------------------------------
async function cuentasDeEjemplo() {
  const todas = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw error;
    todas.push(...data.users.filter((x) => x.email?.endsWith(DOMINIO)));
    if (data.users.length < 1000) break;
  }
  return todas;
}

async function borrar() {
  const cuentas = await cuentasDeEjemplo();
  if (!cuentas.length) {
    console.log("No hay datos de ejemplo cargados. La base ya está limpia de ejemplos.");
    return;
  }
  const ids = cuentas.map((c) => c.id);
  const { count } = await db.from("lotes").select("id", { count: "exact", head: true }).in("vendedor_id", ids);
  // Archivos: las fotos y los comprobantes están en carpetas con el id del vendedor.
  let archivos = 0;
  for (const bucket of ["lotes", "comprobantes"]) {
    for (const id of ids) {
      const { data } = await db.storage.from(bucket).list(id, { limit: 1000 });
      const rutas = (data ?? []).map((f) => `${id}/${f.name}`);
      if (rutas.length) {
        await db.storage.from(bucket).remove(rutas);
        archivos += rutas.length;
      }
    }
  }
  // Al borrar la cuenta se borra en cascada todo lo demás.
  for (const c of cuentas) {
    const { error } = await db.auth.admin.deleteUser(c.id);
    if (error) throw new Error(`No se pudo borrar ${c.email}: ${error.message}`);
  }
  console.log(`🧹 Borrado: ${cuentas.length} cuentas de ejemplo, ${count ?? 0} lotes y ${archivos} archivos (con sus ofertas, favoritos, visitas y fichas).`);
}

async function crearCuenta(clave, datos) {
  const { data, error } = await db.auth.admin.createUser({
    email: `${clave}${DOMINIO}`,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { nombre: datos.nombre, empresa: datos.empresa ?? null, telefono: datos.telefono ?? null, zona: datos.zona, ejemplo: true },
  });
  if (error) throw new Error(`No se pudo crear la cuenta ${clave}: ${error.message}`);
  await db.from("perfiles").update({ verificado: true }).eq("id", data.user.id);
  return data.user.id;
}

async function cargar() {
  await borrar();
  console.log("Cargando ejemplos...");
  const vendedores = {};
  for (const v of VENDEDORES) vendedores[v.clave] = { ...v, id: await crearCuenta(v.clave, v) };
  const compradores = [];
  for (const c of COMPRADORES) compradores.push(await crearCuenta(c.clave, c));

  const ahora = Date.now();
  const ids = [];
  for (const [i, [vend, titulo, categoria, condicion, items, lista, precio, kg, dias, baja, descripcion]] of LOTES.entries()) {
    const v = vendedores[vend];
    const lote = { titulo, categoria };
    const fotos = [];
    for (let k = 0; k < (i % 3 === 0 ? 2 : 1); k++) {
      const ruta = `${v.id}/ejemplo-${i + 1}-${k + 1}.jpg`;
      const { error } = await db.storage.from("lotes").upload(ruta, await foto(lote, k), { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(`No se pudo subir la foto de "${titulo}": ${error.message}`);
      fotos.push(ruta);
    }
    const { data, error } = await db
      .from("lotes")
      .insert({
        vendedor_id: v.id,
        titulo,
        descripcion: `${descripcion}\n\n(Publicación de ejemplo para pruebas.)`,
        categoria,
        condicion,
        items,
        zona: v.zona,
        localidad: v.localidad,
        precio_lista: lista,
        precio_pedido: precio,
        precio_sugerido: precio,
        precio_publicado: precio,
        peso_kg: kg,
        baja_semanal_pct: baja,
        fotos,
        estado: "publicado",
        publicado_at: new Date(ahora - dias * 86_400_000 - i * 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear "${titulo}": ${error.message}`);
    ids.push(data.id);
    await db.from("lote_retiro").insert({ lote_id: data.id, direccion: `Calle de ejemplo ${100 + i}, ${v.localidad}`, horarios: "Lunes a viernes de 8 a 17", indicaciones: "Preguntar por el encargado." });
    if (baja) await db.from("lote_precio_minimo").insert({ lote_id: data.id, precio_minimo: Math.round(precio * 0.7) });
  }

  // Actividad: cada comprador de ejemplo mira algunos lotes de un mismo rubro y
  // guarda uno, así funcionan "quienes vieron esto también vieron" y la popularidad.
  const grupos = [[0, 1, 2, 3, 4], [10, 11, 12, 13], [14, 15, 16, 17, 18], [20, 21, 22, 0, 3], [30, 31, 32, 34, 35]];
  const hoy = new Date().toISOString().slice(0, 10);
  const vistas = [];
  const visitas = [];
  compradores.forEach((comprador, c) => {
    for (const g of [grupos[c], grupos[(c + 1) % grupos.length].slice(0, 2)]) {
      for (const i of g) {
        vistas.push({ usuario_id: comprador, lote_id: ids[i], dia: hoy, veces: 1 + ((c + i) % 2) });
        visitas.push({ lote_id: ids[i], visitante: `ejemplo-${c}`, dia: hoy });
      }
    }
  });
  const unicas = (lista, clave) => [...new Map(lista.map((x) => [clave(x), x])).values()];
  await db.from("vistas_usuario").insert(unicas(vistas, (x) => `${x.usuario_id}${x.lote_id}`));
  await db.from("visitas_lote").insert(unicas(visitas, (x) => `${x.lote_id}${x.visitante}`));
  await db.from("favoritos").insert(compradores.map((comprador, c) => ({ usuario_id: comprador, lote_id: ids[grupos[c][0]] })));

  console.log(`✅ Listo: ${VENDEDORES.length} vendedores, ${COMPRADORES.length} compradores y ${LOTES.length} lotes publicados con fotos.`);
  console.log("   Todo lo de ejemplo usa cuentas @ejemplos.sobra.test. Para borrarlo: npm run ejemplos:borrar");
}

try {
  await (accion === "cargar" ? cargar() : borrar());
} catch (e) {
  console.log(`❌ ${e.message}`);
  console.log("   Revisá la conexión con npm run verificar.");
  process.exit(1);
}
