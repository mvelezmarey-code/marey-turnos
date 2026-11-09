import { createClient } from "@supabase/supabase-js";

// Base de datos de MareyApp (llamadas). Turnos solo usa las funciones turnos_*:
// no cambia nada de MareyApp y las llamadas salen en el mismo historial.
export const llamadasDb = createClient(
  "https://srxlotxroshssnyrufgq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyeGxvdHhyb3Noc3NueXJ1ZmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODM4MTIsImV4cCI6MjA5ODU1OTgxMn0.Yh2HeOGkAB4krgsGLcszpAVOBuUeI1RSFJT9p47gw_s",
  { auth: { persistSession: false, autoRefreshToken: false, storageKey: "turnos-llamadas" } }
);

async function call(fn, args) {
  const { data, error } = await llamadasDb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export const catalogoLlamadas = () => call("turnos_llamadas_catalogo", {});
export const llamadasPorTelefono = (tel) => call("turnos_llamadas_por_telefono", { p_telefono: tel });
export const llamadasDesde = (desde) => call("turnos_llamadas_desde", { p_desde: desde });
export const registrarLlamada = (args) => call("turnos_registrar_llamada", args);

// ---------- Llamadas perdidas / voicemail (cola "Por devolver") ----------
export async function perdidasAbiertas() {
  const { data, error } = await llamadasDb.from("v_llamadas_perdidas").select("*").neq("estado", "cerrada").order("ultima_llamada", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
export async function perdidasCerradas(dias = 7) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await llamadasDb.from("v_llamadas_perdidas").select("*").eq("estado", "cerrada").gte("cerrada_at", desde).order("cerrada_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data || [];
}
export const perdidaTomar = (id, quien) => call("turnos_perdida_tomar", { p_id: id, p_quien: quien });
export const perdidaSoltar = (id) => call("turnos_perdida_soltar", { p_id: id });
export const perdidaNoContesto = (id, quien) => call("turnos_perdida_no_contesto", { p_id: id, p_quien: quien });
export const perdidaCerrar = (id, resultado, quien, llamadaId = null) => call("turnos_perdida_cerrar", { p_id: id, p_resultado: resultado, p_quien: quien, p_llamada: llamadaId });
export const metricasPerdidas = (desde, hasta) => call("metricas_llamadas_perdidas", { p_desde: desde, p_hasta: hasta }).then((d) => (Array.isArray(d) ? d[0] : d));
export const metricasPerdidasPorAgente = (desde, hasta) => call("metricas_llamadas_perdidas_por_agente", { p_desde: desde, p_hasta: hasta });
export async function urlVoicemail(path) {
  const { data } = await llamadasDb.storage.from("voicemails").createSignedUrl(path, 3600);
  return data ? data.signedUrl : null;
}
// Suscripcion en vivo: onNueva(fila) cuando entra una perdida o el mismo numero vuelve a llamar; onCambio() en cualquier cambio
export function suscribirPerdidas(onNueva, onCambio) {
  const ch = llamadasDb.channel("turnos_perdidas_rt")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "llamadas_perdidas" }, (p) => { onNueva(p.new, "nueva"); onCambio(); })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "llamadas_perdidas" }, (p) => {
      if (p.new.estado !== "cerrada" && p.old && p.new.veces > (p.old.veces || 0)) onNueva(p.new, "repite");
      onCambio();
    })
    .subscribe();
  return () => llamadasDb.removeChannel(ch);
}
export const fmtTel = (t) => { const d = String(t || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1"); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (t || ""); };
export const hace = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "ahora"; if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};
// Aviso corto de dos tonos, sin archivos
export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tono = (f, t0, dur) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination); o.start(t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.stop(t0 + dur + 0.05); };
    tono(880, ctx.currentTime, 0.18); tono(1175, ctx.currentTime + 0.2, 0.25);
  } catch (e) { /* sin audio */ }
}

// Status de MareyApp: mismos colores que esa app
export const STATUS_LLAMADA = {
  dirigido: { t: "Dirigido", c: "#0F6E56", b: "#E1F5EE" },
  pendiente_willy: { t: "Pendiente", c: "#854F0B", b: "#FAEEDA" },
  atendido_resuelto: { t: "Resuelto", c: "#3B6D11", b: "#EAF3DE" },
  atendido_cita_marey: { t: "Citó a Marey", c: "#534AB7", b: "#EEEDFE" },
  no_contesto: { t: "No contestó", c: "#A32D2D", b: "#FCEBEB" },
  cita_domicilio: { t: "Cita domicilio", c: "#854F0B", b: "#FAEEDA" },
  cita_confirmada: { t: "Confirmada", c: "#3B6D11", b: "#EAF3DE" },
};
export const estadoLlamada = (l) => {
  const s = STATUS_LLAMADA[l.status] || { t: l.status_label || l.status, c: "#57534E", b: "#F5F5F4" };
  return { ...s, t: l.status === "dirigido" && l.centro_dirigido ? "Dirigido a " + l.centro_dirigido : s.t };
};
// Cuenta como "citado a tienda" para marcar "Llegó a tienda" al crear el turno
export const esCitado = (l) => l.status === "dirigido" || l.status === "atendido_cita_marey";

// Botones de resultado: los mismos 4 de MareyApp
export const RESULTADOS_LLAMADA = [
  { label: "Enviado a San Juan", status: "dirigido", centro: "San Juan", color: "#0F6E56" },
  { label: "Enviado a San Germán", status: "dirigido", centro: "San Germán", color: "#185FA5" },
  { label: "Referido a técnicos", status: "pendiente_willy", centro: null, color: "#854F0B" },
  { label: "Se resolvió", status: "atendido_resuelto", centro: null, color: "#3B6D11" },
];
export const MORADO = "#534AB7";
