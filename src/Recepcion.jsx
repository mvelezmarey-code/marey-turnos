import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtMMSS, fmtHora, fmtDia, soloDigitos, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, useVisitasVenta, rpc, LUGARES_COMPRA } from "./lib.js";
import { Header, Leaderboard, Expediente, BuscadorExpediente, Modal } from "./components.jsx";
import { catalogoLlamadas, llamadasPorTelefono, llamadasDesde, registrarLlamada, estadoLlamada, esCitado, RESULTADOS_LLAMADA, MORADO } from "./llamadas.js";

const vacio = { nombre: "", telefono: "", pueblo: "", modelo: "", serial: "", compra: "" };
const vacioL = { municipio_id: "", modelo_id: "", antiguedad_id: "", problema: "" };
const fechaCorta = (ts) => new Date(ts).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const desdeFiltro = (k) => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }));
  d.setHours(0, 0, 0, 0);
  if (k === "semana") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (k === "mes") d.setDate(1);
  if (k === "ano") { d.setMonth(0); d.setDate(1); }
  return d.toISOString();
};
const MAX_FILA = 4;

export default function Recepcion() {
  const { empleados, modelos } = useCatalogos();
  const { abiertos, hoy, recargar } = useTurnos();
  const lbReg = useLeaderboard("leaderboard_registros_hoy");
  const visitas = useVisitasVenta();
  const now = useNow();
  const nm = (c) => (modelos.find((m) => m.codigo === c) || {}).nombre || c;

  const registradores = useMemo(() => empleados.filter((e) => e.orden_registro != null).sort((a, b) => a.orden_registro - b.orden_registro), [empleados]);
  const [regId, setRegId] = useState(null);
  useEffect(() => { if (!regId && registradores[0]) setRegId(registradores[0].id); }, [registradores, regId]); // siempre arranca en Anthony

  const [tipo, setTipo] = useState("ventanilla"); // ventanilla (Reparación) | llamada
  const [f, setF] = useState(vacio);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [cliente, setCliente] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const [q, setQ] = useState("");
  const [anularId, setAnularId] = useState(null);
  const [verHist, setVerHist] = useState(true);
  const [ventaMsg, setVentaMsg] = useState(null);

  // ---------- Llamadas (base de MareyApp) ----------
  const [cat, setCat] = useState({ municipios: [], modelos: [], antiguedad: [], usuarios: [] });
  const [fl, setFl] = useState(vacioL);
  const [hist, setHist] = useState([]);
  const [bit, setBit] = useState("turnos");
  const [filtro, setFiltro] = useState("hoy");
  const [lista, setLista] = useState([]);
  const [llMsg, setLlMsg] = useState(null);
  useEffect(() => { catalogoLlamadas().then((d) => d && setCat({ municipios: d.municipios || [], modelos: d.modelos || [], antiguedad: d.antiguedad || [], usuarios: d.usuarios || [] })).catch(() => {}); }, []);
  const cargarLista = () => llamadasDesde(desdeFiltro(filtro)).then((d) => setLista(d || [])).catch(() => setLista([]));
  useEffect(() => { if (bit === "llamadas") cargarLista(); }, [bit, filtro]); // eslint-disable-line

  // Pueblo: un solo dropdown (lista de MareyApp) para Reparación y Llamada
  const escogerPueblo = (id) => {
    const m = cat.municipios.find((x) => String(x.id) === String(id));
    setFl((p) => ({ ...p, municipio_id: id }));
    setF((p) => ({ ...p, pueblo: m ? m.nombre : "" }));
  };
  const idDePueblo = (nombre) => {
    const n = String(nombre || "").trim().toLowerCase();
    const m = cat.municipios.find((x) => x.nombre.toLowerCase() === n);
    return m ? String(m.id) : "";
  };

  const tel = soloDigitos(f.telefono);
  // Historial de llamadas de ese teléfono (MareyApp)
  useEffect(() => {
    if (tel.length !== 10) { setHist([]); return; }
    llamadasPorTelefono(tel).then((d) => {
      const h = d || [];
      setHist(h); setVerHist(true);
      const u = h[0];
      if (!u) return;
      setF((p) => ({ ...p, nombre: p.nombre || u.cliente_nombre || "", pueblo: p.pueblo || u.municipio || "" }));
      const mun = cat.municipios.find((m) => m.nombre === u.municipio);
      const mod = cat.modelos.find((m) => m.nombre === u.modelo);
      const ant = cat.antiguedad.find((a) => a.rango === u.antiguedad);
      setFl((p) => ({ ...p, municipio_id: p.municipio_id || (mun ? String(mun.id) : ""), modelo_id: p.modelo_id || (mod ? String(mod.id) : ""), antiguedad_id: p.antiguedad_id || (ant ? String(ant.id) : "") }));
    }).catch(() => setHist([]));
  }, [tel, cat]);
  const citado = hist.find(esCitado) || null;

  // Cliente conocido por teléfono: llena nombre y pueblo
  useEffect(() => {
    if (tel.length !== 10) { setCliente(null); return; }
    supabase.from("clientes").select("*").eq("telefono", tel).maybeSingle().then(({ data }) => {
      setCliente(data || null);
      if (data) {
        setF((p) => ({ ...p, nombre: p.nombre || data.nombre, pueblo: p.pueblo || data.pueblo }));
        setFl((p) => ({ ...p, municipio_id: p.municipio_id || idDePueblo(data.pueblo) }));
      }
    });
  }, [tel, cat]); // eslint-disable-line

  const fila = abiertos.filter((t) => t.tipo === "ventanilla");
  const espera = fila.filter((t) => t.status === "espera").length;
  const arreglando = fila.filter((t) => t.status === "en_proceso").length;
  const bitacora = hoy.filter((t) => t.tipo === "ventanilla");
  const cerrados = bitacora.filter((t) => t.status === "terminado").length;

  const faltan = [];
  if (!f.nombre.trim()) faltan.push("nombre");
  if (tel.length !== 10) faltan.push("teléfono (10 dígitos)");
  if (!f.pueblo.trim()) faltan.push("pueblo");
  if (!f.modelo) faltan.push("modelo");
  if (f.serial.length !== 11) faltan.push("serie de 11 dígitos");
  if (!f.compra) faltan.push("dónde lo compró");
  const ok = faltan.length === 0 && regId;
  const regNombre = (registradores.find((r) => r.id === regId) || {}).nombre || "";
  const faltanL = [];
  if (!f.nombre.trim()) faltanL.push("nombre");
  if (tel.length !== 10) faltanL.push("teléfono (10 dígitos)");
  if (!fl.municipio_id) faltanL.push("pueblo");
  if (!fl.modelo_id) faltanL.push("modelo");
  const okL = faltanL.length === 0 && !!regNombre;
  const sinUsuarioLl = regNombre && cat.usuarios.length > 0 && !cat.usuarios.some((u) => u.nombre.toLowerCase() === regNombre.toLowerCase());

  const limpiar = () => { setF(vacio); setFl(vacioL); setHist([]); setCliente(null); };

  const guardarLlamada = async (r) => {
    if (!okL || busy) return;
    setBusy(true); setLlMsg(null);
    try {
      await registrarLlamada({ p_registra: regNombre, p_nombre: f.nombre, p_telefono: tel, p_municipio_id: Number(fl.municipio_id), p_modelo_id: Number(fl.modelo_id),
        p_antiguedad_id: fl.antiguedad_id ? Number(fl.antiguedad_id) : null, p_problema: fl.problema, p_status: r.status, p_centro: r.centro
