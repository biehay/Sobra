// Pruebas de seguridad contra la base: lo que podría intentar cualquiera con la
// clave pública (la que viaja en el navegador) o con una cuenta propia. Cada
// intento tiene que quedar BLOQUEADO. Se corre contra el Supabase local con datos
// (npm run ejemplos), así:
//   ANON=... SR=... node pruebas/seguridad.mjs
// (las dos claves salen de `npx supabase status -o env`: ANON_KEY y SERVICE_ROLE_KEY).
const URL = "http://127.0.0.1:54321";
const ANON = process.env.ANON, SR = process.env.SR;
const svc = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json", Prefer: "return=representation" };
const res = [];
const ok = (bloqueado, t, det = "") => res.push(`${bloqueado ? "BLOQUEADO " : "⚠️ PASÓ    "} ${t}${det ? "  → " + det : ""}`);
async function usuario(nombre) {
  const email = `${nombre}${Date.now()}@qa.test`;
  const u = await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email, password: "clave-segura-123", email_confirm: true, user_metadata: { nombre } }) }).then((r) => r.json());
  const ses = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "clave-segura-123" }) }).then((r) => r.json());
  const claims = JSON.parse(Buffer.from(ses.access_token.split(".")[1], "base64url").toString());
  // Sesión con el código del email confirmado (como si hubiera completado el segundo paso).
  await fetch(`${URL}/rest/v1/sesiones_verificadas`, { method: "POST", headers: svc, body: JSON.stringify({ session_id: claims.session_id, user_id: u.id }) });
  return { id: u.id, h: { apikey: ANON, Authorization: `Bearer ${ses.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" } };
}
const at = await usuario("atacante"), victima = await usuario("victima");
const req = async (u, metodo, ruta, cuerpo) => { const r = await fetch(`${URL}${ruta}`, { method: metodo, headers: u.h, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; };
const filas = (r) => (Array.isArray(r.j) ? r.j.length : 0);


// ---------- Lecturas: lo que ve un visitante y un usuario cualquiera ----------
{
  const PRIVADAS = { perfiles: 1, lote_retiro: 0, ofertas: 0, codigos_retiro: 0, codigos_acceso: 0, sesiones_verificadas: 0, faltas: 0, denuncias: 0, moderaciones: 0, lote_precio_minimo: 0, precios_reportados: 0, visitas_lote: 0, favoritos: 0, busquedas: 0, busqueda_coincidencias: 0, constancias: 0, reclamos: 0, vistas_usuario: 0 };
  for (const [t, maximo] of Object.entries(PRIVADAS)) {
    const comoVisitante = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1000`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    const comoUsuario = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1000`, { headers: at.h });
    const nV = comoVisitante.ok ? (await comoVisitante.json()).length : 0;
    const nU = comoUsuario.ok ? (await comoUsuario.json()).length : 0;
    ok(nV === 0 && nU <= maximo, `Leer ${t} ajenos`, `visitante ${nV}, usuario ${nU}`);
  }
  const noPublicados = await fetch(`${URL}/rest/v1/lotes?select=id&estado=neq.publicado&estado=neq.reservado&estado=neq.vendido`, { headers: at.h }).then((x) => x.json());
  ok(noPublicados.length === 0, "Ver lotes ajenos sin publicar (borradores, en revisión)", `${noPublicados.length}`);
}

// Un lote publicado de un vendedor de ejemplo
const [lote] = await fetch(`${URL}/rest/v1/lotes?select=id,vendedor_id,precio_publicado&estado=eq.publicado&limit=1`, { headers: svc }).then((r) => r.json());

// 1. Escalar privilegios
let r = await req(at, "PATCH", `/rest/v1/perfiles?id=eq.${at.id}`, { rol: "admin" });
ok(filas(r) === 0 || r.s >= 400, "Hacerse admin a uno mismo", `${r.s}`);
r = await req(at, "PATCH", `/rest/v1/perfiles?id=eq.${at.id}`, { verificado: true });
ok(filas(r) === 0 || r.s >= 400, "Verificarse uno mismo (sacarse el límite de 3 ofertas)", `${r.s}`);
r = await req(at, "PATCH", `/rest/v1/perfiles?id=eq.${victima.id}`, { telefono: "11 0000 0000" });
ok(filas(r) === 0 || r.s >= 400, "Cambiar el perfil de otro", `${r.s}`);
// 2. Lotes ajenos
r = await req(at, "PATCH", `/rest/v1/lotes?id=eq.${lote.id}`, { precio_pedido: 1 });
ok(filas(r) === 0 || r.s >= 400, "Cambiar el precio de un lote ajeno", `${r.s}`);
r = await req(at, "DELETE", `/rest/v1/lotes?id=eq.${lote.id}`);
const sigue = await fetch(`${URL}/rest/v1/lotes?select=id&id=eq.${lote.id}`, { headers: svc }).then((x) => x.json());
ok(sigue.length === 1, "Borrar un lote ajeno", `${r.s}`);
r = await req(at, "POST", `/rest/v1/lotes`, { vendedor_id: victima.id, titulo: "Lote falso a nombre de otro", categoria: "Otros", condicion: "nuevo", zona: "CABA", precio_pedido: 100, estado: "borrador" });
ok(r.s >= 400, "Publicar un lote a nombre de otro", `${r.s}`);
r = await req(at, "POST", `/rest/v1/lotes`, { vendedor_id: at.id, titulo: "Me lo publico yo solo", categoria: "Otros", condicion: "nuevo", zona: "CABA", precio_pedido: 100, estado: "publicado" });
ok(r.s >= 400, "Publicarse un lote saltando la moderación (estado publicado directo)", `${r.s}`);
r = await req(at, "POST", `/rest/v1/lotes`, { vendedor_id: at.id, titulo: "Lote propio de prueba", categoria: "Otros", condicion: "nuevo", zona: "CABA", precio_pedido: 100, estado: "borrador" });
const propio = r.j?.[0]?.id;
r = await req(at, "PATCH", `/rest/v1/lotes?id=eq.${propio}`, { estado: "publicado" });
ok(filas(r) === 0 || r.s >= 400, "Pasar un borrador propio a publicado sin moderación", `${r.s}`);
r = await req(at, "PATCH", `/rest/v1/lotes?id=eq.${propio}`, { precio_publicado: 1, publicado_automatico: true });
ok(filas(r) === 0 || r.s >= 400, "Ponerse a mano el precio publicado", `${r.s}`);
r = await req(at, "POST", `/rest/v1/rpc/moderar_lote`, { p_lote: propio, p_resultado: "aprobado", p_motivos: [], p_mensaje: "" });
ok(r.s >= 400, "Aprobarse el lote llamando a la moderación", `${r.s}`);
// 3. Ofertas
r = await req(at, "POST", `/rest/v1/ofertas`, { lote_id: lote.id, comprador_id: victima.id, monto: 1 });
ok(r.s >= 400, "Ofertar a nombre de otro", `${r.s}`);
r = await req(at, "POST", `/rest/v1/ofertas`, { lote_id: lote.id, comprador_id: at.id, monto: 1, estado: "pagada" });
const of = r.j?.[0];
ok(!of || of.estado === "pendiente", "Crear una oferta ya pagada", of ? `quedó: ${of.estado}` : `${r.s}`);
if (of) {
  r = await req(at, "PATCH", `/rest/v1/ofertas?id=eq.${of.id}`, { estado: "pagada" });
  const ahora = await fetch(`${URL}/rest/v1/ofertas?select=estado&id=eq.${of.id}`, { headers: svc }).then((x) => x.json());
  ok(ahora[0].estado === "pendiente", "Marcar como pagada la propia oferta", `quedó: ${ahora[0].estado}`);
  r = await req(at, "POST", `/rest/v1/rpc/responder_oferta`, { p_oferta: of.id, p_aceptar: true });
  ok(r.s >= 400, "Aceptarse la propia oferta (como si fuera el vendedor)", `${r.s}`);
  r = await req(at, "POST", `/rest/v1/rpc/confirmar_pago`, { p_oferta: of.id });
  ok(r.s >= 400, "Confirmarse el pago (función del admin)", `${r.s}`);
  r = await req(at, "POST", `/rest/v1/rpc/datos_operacion`, { p_oferta: of.id });
  ok(r.s >= 400 || (Array.isArray(r.j) && r.j.every((x) => !x.direccion)), "Ver la dirección de retiro antes de pagar", `${r.s}`);
}
// 4. Admin
r = await req(at, "POST", `/rest/v1/rpc/resolver_denuncias`, { p_lote: lote.id, p_decision: "baja", p_nota: "x" });
ok(r.s >= 400, "Dar de baja un lote ajeno (función del admin)", `${r.s}`);
r = await req(at, "POST", `/rest/v1/rpc/sumar_falta`, { p_usuario: victima.id, p_lote: null, p_origen: "manual", p_detalle: "x" });
ok(r.s >= 400, "Sumarle una falta a otro", `${r.s}`);
r = await req(at, "POST", `/rest/v1/rpc/metricas_recomendaciones`, {});
ok(r.s >= 400 || filas(r) === 0, "Ver métricas del admin", `${r.s}`);
r = await req(at, "PATCH", `/rest/v1/moderaciones?lote_id=eq.${lote.id}`, { auditoria: "acierto" });
ok(filas(r) === 0 || r.s >= 400, "Auditar moderaciones (función del admin)", `${r.s}`);
// 5. Precios reportados (memoria de precios): envenenarla directo
r = await req(at, "POST", `/rest/v1/precios_reportados`, { texto: "fibra", palabras: ["fibra"], unidad: "m", precio_usd_por_unidad: 999, dolar: 1000, quien: "x", origen: "calculadora" });
ok(r.s >= 400, "Cargar precios falsos directo en la memoria de precios", `${r.s}`);
// 6. Archivos
const sube = async (u, bucket, ruta) => (await fetch(`${URL}/storage/v1/object/${bucket}/${ruta}`, { method: "POST", headers: { apikey: ANON, Authorization: u.h.Authorization, "Content-Type": "image/jpeg" }, body: Buffer.from("ffd8ffe000104a464946", "hex") })).status;
ok((await sube(at, "lotes", `${victima.id}/foto.jpg`)) >= 400, "Subir una foto a la carpeta de otro");
ok((await sube(at, "lotes", `${at.id}/../${victima.id}/foto.jpg`)) >= 400, "Subir a la carpeta de otro con ../");
ok((await sube(at, "comprobantes", `${victima.id}/c.pdf`)) >= 400, "Subir un comprobante de transferencia (solo el admin)");
const lista = await fetch(`${URL}/storage/v1/object/list/comprobantes`, { method: "POST", headers: { apikey: ANON, Authorization: at.h.Authorization, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "" }) });
const lj = await lista.json().catch(() => []);
ok(!Array.isArray(lj) || lj.length === 0, "Listar los comprobantes de transferencias de otros", `${lista.status}`);
const publico = await fetch(`${URL}/storage/v1/object/public/comprobantes/x.pdf`);
ok(publico.status >= 400, "Ver comprobantes por link público", `${publico.status}`);
// 7. Sin el código del email (segundo paso) no se puede escribir
const email3 = `sincodigo${Date.now()}@qa.test`;
await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email: email3, password: "clave-segura-123", email_confirm: true }) });
const s3 = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: email3, password: "clave-segura-123" }) }).then((x) => x.json());
const sinCodigo = { h: { apikey: ANON, Authorization: `Bearer ${s3.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" } };
r = await req(sinCodigo, "POST", `/rest/v1/ofertas`, { lote_id: lote.id, comprador_id: JSON.parse(Buffer.from(s3.access_token.split(".")[1], "base64url").toString()).sub, monto: 1000 });
ok(r.s >= 400, "Ofertar con la contraseña robada pero sin el código del email", `${r.s}`);
console.log(res.join("\n"));
const pasaron = res.filter((x) => x.startsWith("⚠️")).length;
console.log(`\n${pasaron} intentos pasaron de ${res.length}`);
process.exit(pasaron ? 1 : 0);
