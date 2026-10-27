// Tipos y catálogos compartidos. Reflejan el esquema de
// supabase/migrations/20261027000000_esquema_inicial.sql.

export type Rol = "vendedor" | "comprador" | "admin";
export type EstadoLote =
  | "borrador"
  | "en_revision"
  | "publicado"
  | "reservado"
  | "vendido"
  | "rechazado"
  | "pausado";
export type Condicion = "nuevo" | "sin_uso" | "usado_buen_estado";
export type EstadoOferta = "pendiente" | "aceptada" | "rechazada" | "cancelada" | "pagada" | "completada";
export type ModoRetiro = "retira_comprador" | "flete_sobra";

export type Perfil = {
  id: string;
  rol: Rol;
  nombre: string;
  empresa: string | null;
  cuit: string | null;
  telefono: string | null;
  zona: string | null;
  verificado: boolean;
  created_at: string;
};

export type Item = { nombre: string; cantidad: number; unidad: string };

export type Lote = {
  id: string;
  vendedor_id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  condicion: Condicion;
  items: Item[];
  zona: string;
  localidad: string;
  precio_lista: number | null;
  precio_pedido: number;
  precio_sugerido: number | null;
  precio_publicado: number | null;
  fotos: string[];
  estado: EstadoLote;
  nota_admin: string | null;
  publicado_at: string | null;
  created_at: string;
};

export type Oferta = {
  id: string;
  lote_id: string;
  comprador_id: string;
  monto: number;
  mensaje: string;
  retiro: ModoRetiro;
  estado: EstadoOferta;
  comision: number | null;
  pagada_at: string | null;
  completada_at: string | null;
  liquidada_at: string | null;
  created_at: string;
};

export const CATEGORIAS = [
  "Cerámicos y porcelanatos",
  "Sanitarios y grifería",
  "Electricidad e iluminación",
  "Plomería y gas",
  "Cemento, cal y áridos",
  "Hierros y perfiles",
  "Maderas y placas",
  "Aberturas",
  "Pinturas e impermeabilizantes",
  "Aislantes y durlock",
  "Herramientas y equipos",
  "Otros",
] as const;

export const ZONAS = ["CABA", "GBA Norte", "GBA Oeste", "GBA Sur", "La Plata y alrededores"] as const;

export const CONDICIONES: Record<Condicion, string> = {
  nuevo: "Nuevo, en su embalaje",
  sin_uso: "Sin uso",
  usado_buen_estado: "Usado en buen estado",
};

export const ESTADOS_LOTE: Record<EstadoLote, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  publicado: "Publicado",
  reservado: "Reservado",
  vendido: "Vendido",
  rechazado: "Con observaciones",
  pausado: "Pausado",
};

export const ESTADOS_OFERTA: Record<EstadoOferta, string> = {
  pendiente: "Esperando respuesta",
  aceptada: "Aceptada, falta el pago",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  pagada: "Pagada, coordinar retiro",
  completada: "Completada",
};

export const MODOS_RETIRO: Record<ModoRetiro, string> = {
  retira_comprador: "Retiro por mi cuenta",
  flete_sobra: "Quiero flete de Sobrá (se cotiza aparte)",
};

// Comisión de Sobrá. Debe coincidir con public.tasa_comision() en la base.
export const TASA_COMISION = 0.12;

// Precio sugerido como fracción del precio de lista según la condición.
// Es una primera regla para orientar al admin; se ajusta con datos reales de ventas.
const FACTOR_PRECIO: Record<Condicion, number> = {
  nuevo: 0.6,
  sin_uso: 0.5,
  usado_buen_estado: 0.35,
};

export function precioSugerido(precioLista: number | null, condicion: Condicion): number | null {
  if (!precioLista || precioLista <= 0) return null;
  // Redondeo a múltiplos de 1.000 para que el precio quede prolijo.
  return Math.max(1000, Math.round((precioLista * FACTOR_PRECIO[condicion]) / 1000) * 1000);
}

export function descuento(precio: number, precioLista: number | null): number | null {
  if (!precioLista || precioLista <= precio) return null;
  return Math.round((1 - precio / precioLista) * 100);
}

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function pesos(valor: number | null | undefined): string {
  return valor == null ? "-" : formatoPesos.format(valor);
}

export function urlFoto(ruta: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lotes/${ruta}`;
}

export function linkWhatsapp(mensaje: string, telefono = process.env.NEXT_PUBLIC_WHATSAPP): string {
  const numero = (telefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
