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
