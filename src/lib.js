import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

// ---------- Colores (iguales al mockup premium) ----------
export const C = {
  ink: "#1C1917", ink2: "#44403C", muted: "#57534E", faint: "#78716C", line: "#ECEAE6", line2: "#E7E5E4", line3: "#D6D3D1",
  bg: "#F3F2EF", card: "#FFFFFF", soft: "#FAFAF9", soft2: "#F3F2EF",
  orange: "#B45309", orangeDark: "#92400E", orangeSoft: "#FFF7EB", orangeLine: "#D9B48A",
  blue: "#1D4ED8", blueDark: "#1E3A8A", blueSoft: "#EFF4FF",
  green: "#15803D", greenDark: "#14532D", greenSoft: "#E9F7EE",
  red: "#B91C1C", redDark: "#991B1B", redSoft: "#FDECEC",
  morado: "#534AB7", moradoDark: "#3C3489", moradoSoft: "#F4F3FE",
  gris: "#D6D3D1",
};
export const mono = "'IBM Plex Mono', monospace";

// ---------- Fechas ----------
export const TZ = "America/Puerto_Rico";
export const hoyPR = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const fmtHora = (ts) => new Date(ts).toLocaleTimeString("es-PR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fmtFecha = (ts) => new Date(ts).toLocaleDateString("es-PR", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDia = (ts) => new Date(ts).toLocaleDateString("es-PR", { timeZone: TZ, month: "short", day: "numeric" });
export const fmtMMSS = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
};
export const titulo = (n) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : "");
export const soloDigitos = (v) => String(v || "").replace(/[^0-9]/g, "");

export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(iv); }, [ms]);
  return now;
};

// ---------- Catálogos ----------
export function useCatalogos() {
  const [empleados, setEmpleados] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [causas, setCausas] = useState([]);
  const cargarPiezas = useCallback(() => supabase.from("piezas_por_modelo").select("*").order("orden").then(({ data }) => data && setPiezas(data)), []);
  const cargarCausas = useCallback(() => supabase.from("causas").select("*").eq("activo", true).order("orden").then(({ data }) => data && setCausas(data)), []);
  useEffect(() => {
    supabase.from("empleados_publicos").select("*").then(({ data }) => data && setEmpleados(data));
    supabase.from("modelos").select("*").eq("activo", true).order("orden").then(({ data }) => data && setModelos(data));
    cargarPiezas(); cargarCausas();
  }, [cargarPiezas, cargarCausas]);
  return { empleados, modelos, piezas, causas, cargarPiezas, cargarCausas };
}

// ---------- Turnos abiertos (espera, en proceso y esperando decisión de Anthony) + de hoy, con realtime ----------
export function useTurnos() {
  const [abiertos, setAbiertos] = useState([]);
  const [hoy, setHoy] = useState([]);
  const cargar = useCallback(async () => {
    const [a, h] = await Promise.all([
      supabase.from("turnos_completos").select("*").in("status", ["espera", "en_proceso", "decision"]).order("created_at"),
      supabase.from("turnos_completos").select("*").eq("fecha", hoyPR()).in("status", ["terminado", "anulado"]).order("terminado_at", { ascending: false }),
    ]);
    if (a.data) setAbiertos(a.data);
    if (h.data) setHoy(h.data);
  }, []);
  useEffect(() => {
    cargar();
    const ch = supabase.channel("turnos_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "turnos" }, () => cargar())
      .subscribe();
    const iv = setInterval(cargar, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [cargar]);
  return { abiertos, hoy, recargar: cargar };
}

export function useLeaderboard(vista) {
  const [rows, setRows] = useState([]);
  const cargar = useCallback(() => { supabase.from(vista).select("*").then(({ data }) => data && setRows(data)); }, [vista]);
  useEffect(() => {
    cargar();
    const ch = supabase.channel("lb_" + vista)
      .on("postgres_changes", { event: "*", schema: "public", table: "turnos" }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar, vista]);
  return rows;
}

// ---------- Clientes de venta de hoy (botón sin fila) ----------
export function useVisitasVenta() {
  const [n, setN] = useState(0);
  const cargar = useCallback(() => {
    supabase.from("visitas_venta").select("id", { count: "exact", head: true }).eq("fecha", hoyPR()).then(({ count }) => setN(count || 0));
  }, []);
  useEffect(() => {
    cargar();
    const ch = supabase.channel("visitas_venta_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitas_venta" }, () => cargar())
      .subscribe();
    const iv = setInterval(cargar, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [cargar]);
  return { n, setN, recargar: cargar };
}

// ---------- RPC con mensaje de error legible ----------
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Reglas de resultado (mismas que la base de datos) ----------
export const SIN_PIEZA = "Sin pieza dañada, se orientó";
export const RESULTADOS_VENTANILLA = ["Reparado", "Cliente no quiso reparar", SIN_PIEZA];
export const DESC_RESULTADO = {
  "Reparado": "Cambié la pieza y quedó funcionando",
  "Cliente no quiso reparar": "Se le explicó y decidió no hacerlo",
  [SIN_PIEZA]: "No había nada roto: se le explicó al cliente",
};
export const SALIDAS = [
  { n: "Remanufacturado", d: "Se llevó uno remanufacturado" },
  { n: "Nuevo", d: "Compró uno nuevo" },
  { n: "Ninguno", d: "Se fue sin calentador" },
];
export const RAZONES_NINGUNO = ["Muy caro", "Lo va a pensar", "Lo arregla por su cuenta", "Va a comprar en otro sitio", "Otro"];
export const LUGARES_COMPRA = ["Ferretería", "National", "Home Depot", "Walmart", "Marey directo", "Otro"];

// ---------- Estilos base (premium) ----------
const sombra = "0 1px 2px rgba(28,25,23,0.04), 0 12px 32px -20px rgba(28,25,23,0.18)";
const flecha = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2378716C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";
export const S = {
  card: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: sombra },
  cap: { fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 },
  input: { height: 46, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "0 14px", fontSize: 16, fontWeight: 500, color: C.ink, background: C.soft, minWidth: 0, width: "100%", textTransform: "none", letterSpacing: 0 },
  select: { height: 46, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "0 36px 0 14px", fontSize: 16, fontWeight: 500, color: C.ink, minWidth: 0, width: "100%", textTransform: "none", letterSpacing: 0,
    appearance: "none", WebkitAppearance: "none", backgroundColor: C.soft, backgroundImage: flecha, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" },
  btn: (bg, fg = "#fff") => ({ height: 54, padding: "0 22px", borderRadius: 12, border: "none", background: bg, color: fg, fontSize: 16, fontWeight: 700,
    boxShadow: bg === C.gris ? "none" : `0 6px 16px -8px ${bg}99` }),
  ghost: { height: 44, padding: "0 16px", borderRadius: 12, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2, fontSize: 15, fontWeight: 600 },
  pill: (bg, fg) => ({ flex: "none", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 12, background: bg, color: fg, whiteSpace: "nowrap" }),
  // Opción en forma de pill (dónde lo compró, filtros)
  chip: (on, color = C.orange, soft = C.orangeSoft, dark = C.orangeDark) => ({
    height: 38, padding: "0 14px", borderRadius: 19, fontSize: 14,
    border: `1px solid ${on ? color : C.line2}`, background: on ? soft : "#fff", color: on ? dark : C.ink2, fontWeight: on ? 700 : 500,
  }),
  // Opción grande (piezas, causas, técnicos)
  opcion: (on, color = C.orange, soft = C.orangeSoft, dark = C.orangeDark) => ({
    minHeight: 62, padding: "4px 12px", borderRadius: 12, fontSize: 16,
    border: on ? `1.5px solid ${color}` : `1px solid ${C.line2}`, background: on ? soft : "#fff", color: on ? dark : C.ink, fontWeight: on ? 700 : 500,
    boxShadow: on ? `0 6px 14px -10px ${color}99` : "none",
  }),
  // Control segmentado (tipo iOS)
  segWrap: { display: "grid", gap: 4, padding: 4, background: C.soft2, borderRadius: 12 },
  seg: (on) => ({ minHeight: 42, borderRadius: 9, border: "none", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: on ? "#fff" : "transparent", color: on ? C.ink : C.faint, fontWeight: on ? 700 : 600,
    boxShadow: on ? "0 1px 2px rgba(28,25,23,0.08), 0 2px 8px -2px rgba(28,25,23,0.10)" : "none" }),
  dot: (color) => ({ width: 8, height: 8, borderRadius: "50%", background: color, flex: "none", display: "inline-block" }),
};
