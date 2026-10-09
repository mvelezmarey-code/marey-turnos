import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

// ---------- Colores (iguales al mockup) ----------
export const C = {
  ink: "#1C1917", ink2: "#44403C", muted: "#57534E", faint: "#78716C", line: "#E7E5E4", line2: "#D6D3D1",
  bg: "#F6F5F2", card: "#FFFFFF", soft: "#FAFAF9", soft2: "#F5F5F4",
  orange: "#B45309", orangeDark: "#92400E", orangeSoft: "#FEF3C7",
  blue: "#1D4ED8", blueDark: "#1E3A8A", blueSoft: "#DBEAFE",
  green: "#15803D", greenDark: "#14532D", greenSoft: "#DCFCE7",
  red: "#B91C1C", redDark: "#991B1B", redSoft: "#FEE2E2",
};
export const mono = "'IBM Plex Mono', monospace";

// ---------- Fechas ----------
export const TZ = "America/Puerto_Rico";
export const hoyPR = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const fmtHora = (ts) => new Date(ts).toLocaleTimeString("es-PR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fmtFecha = (ts) => new Date(ts).toLocaleDateString("es-PR", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
  useEffect(() => {
    supabase.from("empleados_publicos").select("*").then(({ data }) => data && setEmpleados(data));
    supabase.from("modelos").select("*").eq("activo", true).order("orden").then(({ data }) => data && setModelos(data));
    supabase.from("piezas_por_modelo").select("*").order("orden").then(({ data }) => data && setPiezas(data));
  }, []);
  return { empleados, modelos, piezas };
}

// ---------- Turnos abiertos + de hoy, con realtime ----------
export function useTurnos() {
  const [abiertos, setAbiertos] = useState([]);
  const [hoy, setHoy] = useState([]);
  const cargar = useCallback(async () => {
    const [a, h] = await Promise.all([
      supabase.from("turnos_completos").select("*").in("status", ["espera", "en_proceso"]).order("created_at"),
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

// ---------- RPC con mensaje de error legible ----------
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Reglas de resultado (mismas que la base de datos) ----------
export const SIN_PIEZA = "Sin pieza dañada, se orientó";
export const RESULTADOS_VENTANILLA = ["Reparado", "Cliente no quiso reparar", SIN_PIEZA];
export const RESULTADOS_VENTA = ["Compró", "Cotización", "Solo información"];

// ---------- Estilos base ----------
export const S = {
  card: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: C.ink2 },
  input: { height: 44, border: `1px solid ${C.line2}`, borderRadius: 8, padding: "0 12px", fontSize: 16, background: "#fff", minWidth: 0 },
  btn: (bg, fg = "#fff") => ({ height: 48, padding: "0 18px", borderRadius: 10, border: "none", background: bg, color: fg, fontSize: 16, fontWeight: 700 }),
  ghost: { height: 44, padding: "0 16px", borderRadius: 8, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2, fontSize: 15, fontWeight: 600 },
  pill: (bg, fg) => ({ flex: "none", fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 999, background: bg, color: fg }),
  toggle: (on, color, soft, dark) => ({
    minHeight: 44, padding: "4px 8px", borderRadius: 8, fontSize: 14,
    border: on ? `2px solid ${color}` : `1px solid ${C.line2}`, background: on ? soft : "#fff",
    color: on ? dark : C.ink2, fontWeight: on ? 700 : 500,
  }),
};
