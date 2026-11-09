import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtMMSS, fmtHora, fmtDia, soloDigitos, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, useVisitasVenta, rpc, LUGARES_COMPRA, SALIDAS, RAZONES_NINGUNO } from "./lib.js";
import { Header, Leaderboard, Expediente, BuscadorExpediente, Modal } from "./components.jsx";
import { catalogoLlamadas, llamadasPorTelefono, llamadasDesde, registrarLlamada, estadoLlamada, esCitado, RESULTADOS_LLAMADA, MORADO,
  perdidasAbiertas, perdidasCerradas, perdidaTomar, perdidaSoltar, perdidaNoContesto, perdidaCerrar, suscribirPerdidas, urlVoicemail, fmtTel, hace, beep } from "./llamadas.js";

const vacio = { nombre: "", telefono: "", pueblo: "", modelo: "", compra: "" };
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
// Mensajes de garantía para copiar y pegar (botones arriba en la barra)
const GARANTIAS = [
  { k: "nuevo", label: "Garantía nuevo", texto: "GARANTÍA Y DEVOLUCIONES: Las unidades nuevas cuentan con 5 años de garantía en piezas y 1 año en servicio, aplicable únicamente a defectos de fábrica. No cubre daños por instalación incorrecta, sedimentos debido a la calidad del agua ni fluctuaciones de voltaje. Se aceptan devoluciones dentro de los primeros 7 días laborables, siempre que la unidad no haya sido instalada.\n\nADVERTENCIA: Las unidades de gas no deben instalarse en lugares donde puedan mojarse o quedar expuestas directamente a la lluvia o al agua." },
  { k: "openbox", label: "Garantía open box", texto: "GARANTÍA OPEN BOX: Equipos con empaque abierto, inspeccionados y certificados en perfecto estado técnico, vendidos con descuento comercial. Incluyen 2 años de garantía en piezas y 1 año en servicio en centros autorizados. Cubre únicamente defectos internos de fábrica. No cubre detalles estéticos preexistentes, mala instalación, fluctuaciones de voltaje, exposición directa a la lluvia ni daños por sedimentos. Se aceptan devoluciones dentro de los primeros 7 días laborables." },
];
const copiarTexto = async (t) => {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    // Plan B para navegadores que no dejan usar el portapapeles directo
    const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    document.body.removeChild(ta); return ok;
  }
};
const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Campo que se puede escribir o escoger de la lista (pueblo, modelo)
function Combo({ items, valueId, onPick, placeholder = "Escribe o escoge", label }) {
  const elegido = items.find((m) => String(m.id) === String(valueId));
  const [texto, setTexto] = useState(elegido ? elegido.nombre : "");
  const [abierto, setAbierto] = useState(false);
  const [idx, setIdx] = useState(0);
  const tecleando = useRef(false);
  // Si el valor cambia desde afuera (historial de llamadas, limpiar formulario), el texto lo sigue
  useEffect(() => {
    if (elegido) setTexto(elegido.nombre);
    else if (!tecleando.current) setTexto("");
    tecleando.current = false;
  }, [valueId, items.length]); // eslint-disable-line
  const q = norm(texto);
  const lista = (q
    ? items.filter((m) => norm(m.nombre).includes(q)).sort((a, b) => (norm(b.nombre).startsWith(q) ? 1 : 0) - (norm(a.nombre).startsWith(q) ? 1 : 0))
    : items).slice(0, 8);
  const escoger = (m) => { setTexto(m.nombre); setAbierto(false); onPick(String(m.id)); };
  const escribir = (v) => {
    tecleando.current = true;
    setTexto(v); setAbierto(true); setIdx(0);
    const exacto = items.find((m) => norm(m.nombre) === norm(v));
    onPick(exacto ? String(exacto.id) : "");
  };
  const teclas = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setIdx((i) => Math.min(i + 1, lista.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if ((e.key === "Enter" || e.key === "Tab") && abierto && texto.trim() && lista[idx]) { if (e.key === "Enter") e.preventDefault(); escoger(lista[idx]); }
    else if (e.key === "Escape") setAbierto(false);
  };
  const malo = texto.trim() && !valueId && !abierto;
  const caja = { position: "absolute", top: 50, left: 0, right: 0, zIndex: 20, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 18px 36px -14px rgba(28,25,23,0.3)", textTransform: "none", letterSpacing: 0 };
  return (
    <div style={{ position: "relative" }}>
      <input value={texto} onChange={(e) => escribir(e.target.value)} onFocus={(e) => { setAbierto(true); e.target.select(); }} onBlur={() => setTimeout(() => setAbierto(false), 150)} onKeyDown={teclas}
        placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={abierto} aria-label={label}
        style={{ ...S.input, paddingRight: 36, ...(malo ? { borderColor: "#F3C4C4", background: C.redSoft } : {}) }} />
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ position: "absolute", right: 14, top: 16, pointerEvents: "none" }}><path d="m6 9 6 6 6-6" /></svg>
      {abierto && lista.length > 0 && (
        <div role="listbox" style={{ ...caja, padding: 4, maxHeight: 290, overflowY: "auto" }}>
          {lista.map((m, i) => {
            const on = String(m.id) === String(valueId);
            return (
              <button key={m.id} type="button" role="option" aria-selected={on} onMouseDown={(e) => { e.preventDefault(); escoger(m); }} onMouseEnter={() => setIdx(i)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: on ? 700 : 500, color: C.ink, background: i === idx ? C.orangeSoft : "transparent" }}>{m.nombre}</button>
            );
          })}
        </div>
      )}
      {abierto && q && lista.length === 0 && <div style={{ ...caja, padding: "10px 14px", fontSize: 13, color: C.faint, fontWeight: 500 }}>No hay ninguno con ese nombre</div>}
      {malo && <div style={{ fontSize: 12, color: C.redDark, fontWeight: 600, textTransform: "none", letterSpacing: 0, marginTop: 4 }}>Escoge uno de la lista</div>}
    </div>
  );
}

// Mini dashboard de llamadas perdidas de hoy (arriba de la lista "Por devolver")
const esHoyPR = (iso) => iso && new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Puerto_Rico" }) === new Date().toLocaleDateString("en-CA", { timeZone: "America/Puerto_Rico" });
function MiniPerdidas({ abiertas, cerradas }) {
  const hoyAb = abiertas.filter((p) => esHoyPR(p.primera_llamada));
  const hoyCe = cerradas.filter((p) => esHoyPR(p.primera_llamada));
  const entraron = hoyAb.length + hoyCe.length;
  const vm = [...hoyAb, ...hoyCe].filter((p) => p.tiene_voicemail).length;
  const dev = hoyCe.filter((p) => p.resultado === "contestada");
  const noCont = hoyCe.filter((p) => p.resultado === "no_contesta").length;
  const prom = dev.length ? Math.round(dev.reduce((a, p) => a + (p.minutos_respuesta || 0), 0) / dev.length) : null;
  const pct = entraron ? Math.round(dev.length / entraron * 100) : 0;
  const por = {};
  hoyCe.forEach((p) => { if (!p.cerrada_por) return; const q = por[p.cerrada_por] || (por[p.cerrada_por] = { dev: 0, otras: 0, min: 0 }); if (p.resultado === "contestada") { q.dev++; q.min += p.minutos_respuesta || 0; } else q.otras++; });
  const personas = Object.entries(por).sort((a, b) => b[1].dev - a[1].dev);
  const tile = (l, v, color) => (
    <div key={l} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{l}</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: color || C.ink }}>{v}</div>
    </div>
  );
  return (
    <div style={{ padding: "12px 18px 14px", borderTop: `1px solid ${C.soft2}`, background: C.soft, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
        {tile("Hoy entraron", entraron)}
        {tile("Voicemail", vm, C.moradoDark)}
        {tile("Devueltas", dev.length, C.greenDark)}
        {tile("No contestaron", noCont, noCont ? C.redDark : C.ink)}
        {tile("Respuesta", prom != null ? `${prom} min` : "—")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: C.soft2, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.green }} /></div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, flex: "none" }}>{pct}% devueltas</div>
      </div>
      {personas.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
          <span style={{ fontWeight: 700, color: C.ink2 }}>Quién atendió:</span>
          {personas.map(([n, q]) => <span key={n}><b style={{ color: C.ink }}>{titulo(n)}</b> {q.dev} devuelta{q.dev !== 1 ? "s" : ""}{q.dev ? ` · ${Math.round(q.min / q.dev)} min` : ""}{q.otras ? ` · ${q.otras} sin contestar/spam` : ""}</span>)}
        </div>
      )}
    </div>
  );
}

export default function Recepcion() {
  const { empleados, modelos } = useCatalogos();
  const { abiertos, hoy, recargar } = useTurnos();
  const lbReg = useLeaderboard("leaderboard_registros_hoy");
  const visitas = useVisitasVenta();
  const now = useNow();
  const nm = (c) => (modelos.find((m) => m.codigo === c) || {}).nombre || c;
  const modelosCombo = useMemo(() => modelos.map((m) => ({ id: m.codigo, nombre: m.nombre })), [modelos]);

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
  const [copiado, setCopiado] = useState(null); // { k, ok } del botón de garantía que se tocó
  // Decisión de Anthony: con qué se fue el cliente que no quiso reparar
  const [elegida, setElegida] = useState(null);
  const [razon, setRazon] = useState(null);
  const [otro, setOtro] = useState("");
  const [decMsg, setDecMsg] = useState(null);

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

  // ---------- Llamadas perdidas / voicemail (MareyApp) ----------
  const [perdidas, setPerdidas] = useState([]);
  const [perdidasCerr, setPerdidasCerr] = useState([]);
  const [devolviendo, setDevolviendo] = useState(null); // perdida que se esta devolviendo
  const [aviso, setAviso] = useState(null);
  const [audios, setAudios] = useState({});
  const cargarPerdidas = () => { perdidasAbiertas().then(setPerdidas).catch(() => {}); perdidasCerradas(7).then(setPerdidasCerr).catch(() => {}); };
  useEffect(() => {
    cargarPerdidas();
    const off = suscribirPerdidas((fila, tipoAviso) => { setAviso({ ...fila, tipoAviso }); beep(); }, cargarPerdidas);
    const iv = setInterval(cargarPerdidas, 60000);
    return () => { off(); clearInterval(iv); };
  }, []);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 25000); return () => clearTimeout(t); }, [aviso]);
  const escucharVm = async (p) => { if (audios[p.id] || !p.voicemail_url) return; const u = await urlVoicemail(p.voicemail_url); if (u) setAudios((a) => ({ ...a, [p.id]: u })); };

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

  const fila = abiertos.filter((t) => t.tipo === "ventanilla" && (t.status === "espera" || t.status === "en_proceso"));
  const pendientes = abiertos.filter((t) => t.tipo === "ventanilla" && t.status === "decision");
  const dec = pendientes[0] || null;
  const maxFila = dec ? 3 : MAX_FILA; // con la tarjeta de decisión se enseñan 3 para que la pantalla no haga scroll
  const espera = fila.filter((t) => t.status === "espera").length;
  const arreglando = fila.filter((t) => t.status === "en_proceso").length;
  const bitacora = hoy.filter((t) => t.tipo === "ventanilla");
  const cerrados = bitacora.filter((t) => t.status === "terminado").length;

  const faltan = [];
  if (!f.nombre.trim()) faltan.push("nombre");
  if (tel.length !== 10) faltan.push("teléfono (10 dígitos)");
  if (!f.pueblo.trim()) faltan.push("pueblo");
  if (!f.modelo) faltan.push("modelo");
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

  const limpiar = () => { setF(vacio); setFl(vacioL); setHist([]); setCliente(null); setDevolviendo(null); };

  // Lo que ve esta pantalla: abiertas + la que este usuario esta atendiendo. Las que tomo otro (Carlos en MareyApp) desaparecen.
  const perdidasVisibles = perdidas.filter((p) => p.estado === "abierta" || (regNombre && p.tomada_por && p.tomada_por.toLowerCase() === regNombre.toLowerCase()));

  // Atender: la toma (desaparece de la lista del otro) y abre el formulario de llamada con el telefono puesto
  const devolver = (p) => {
    setDevolviendo(p); setTipo("llamada"); setBit("perdidas");
    setF({ ...vacio, telefono: fmtTel(p.telefono) }); setFl(vacioL); setCliente(null);
    if (p.estado === "abierta" && regNombre) perdidaTomar(p.id, regNombre).then(cargarPerdidas).catch(() => {});
  };
  const accionPerdida = async (fn) => { try { await fn(); } catch (e) { setLlMsg({ ok: false, t: e.message }); } cargarPerdidas(); };
  const limpiarAtendiendo = () => { setDevolviendo(null); setF(vacio); setFl(vacioL); setHist([]); setCliente(null); setBit("perdidas"); };
  // No contesto: suma un intento y la suelta para que vuelva a la lista; al tercero se cierra sola
  const noContestoAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(async () => {
      const n = await perdidaNoContesto(p.id, regNombre);
      if (n < 3) await perdidaSoltar(p.id);
      setLlMsg({ ok: true, t: n >= 3 ? `${fmtTel(p.telefono)} cerrada: no contestó en 3 intentos.` : `${fmtTel(p.telefono)} vuelve a la lista · ${n} ${n === 1 ? "intento" : "intentos"} sin contestar.` });
    });
    limpiarAtendiendo();
  };
  const spamAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(() => perdidaCerrar(p.id, "spam", regNombre));
    setLlMsg({ ok: true, t: `${fmtTel(p.telefono)} marcada como spam.` });
    limpiarAtendiendo();
  };
  // Cancelar: la suelta y vuelve a la lista de los dos
  const cancelarAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(() => perdidaSoltar(p.id));
    limpiarAtendiendo();
  };

  const guardarLlamada = async (r) => {
    if (!okL || busy) return;
    setBusy(true); setLlMsg(null);
    try {
      const res = await registrarLlamada({ p_registra: regNombre, p_nombre: f.nombre, p_telefono: tel, p_municipio_id: Number(fl.municipio_id), p_modelo_id: Number(fl.modelo_id),
        p_antiguedad_id: fl.antiguedad_id ? Number(fl.antiguedad_id) : null, p_problema: fl.problema, p_status: r.status, p_centro: r.centro });
      // si venia de una llamada perdida, se cierra como devuelta y queda enlazada
      const idL = typeof res === "string" ? res : (res && (res.id || (Array.isArray(res) && res[0] && res[0].id))) || null;
      const dv = devolviendo;
      if (dv) { try { await perdidaCerrar(dv.id, "contestada", regNombre, idL); } catch (_) { /* no bloquea el guardado */ } }
      setLlMsg({ ok: true, t: dv ? `Llamada devuelta a ${f.nombre.trim()} · ${r.label}.` : `Llamada de ${f.nombre.trim()} guardada en MareyApp · ${r.label}.` });
      limpiar(); setBit(dv ? "perdidas" : "llamadas"); cargarLista(); cargarPerdidas();
    } catch (e) { setLlMsg({ ok: false, t: e.message }); }
    setBusy(false);
  };

  // Nota que ve el técnico: lo que dijo por teléfono y si venía citado
  const notaLlamada = () => {
    const u = hist[0];
    if (!u) return null;
    const partes = [];
    if (citado) partes.push(`Llegó a tienda (citado por ${citado.registrado_por || "agente"} el ${fechaCorta(citado.created_at)})`);
    if (u.problema) partes.push(`Por teléfono: ${u.problema}`);
    return partes.join(" · ") || null;
  };

  const crear = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg(null);
    try {
      const t = await rpc("crear_turno", {
        p_tipo: "ventanilla", p_registrado_por: regId, p_nombre: f.nombre, p_telefono: tel, p_pueblo: f.pueblo,
        p_modelo: f.modelo, p_serial: null, p_busca: null, p_tipo_cliente: null,
        p_nota: notaLlamada(), p_atender_ahora: false, p_lugar_compra: f.compra,
      });
      setMsg({ ok: true, t: `Turno ${t.numero} creado para ${f.nombre.trim()}.` + (citado ? " Llegó a tienda (citado por teléfono)." : "") });
      limpiar(); recargar();
    } catch (e) { setMsg({ ok: false, t: e.message }); }
    setBusy(false);
  };

  const anular = async (t) => {
    setAnularId(null);
    try { await rpc("anular_turno", { p_turno: t.id, p_empleado: regId, p_motivo: "Cliente se fue" }); recargar(); } catch (e) { setMsg({ ok: false, t: e.message }); }
  };

  const sumarVenta = async () => {
    if (!regId) return;
    try { const n = await rpc("registrar_visita_venta", { p_empleado: regId }); visitas.setN(n); setVentaMsg({ ok: true, t: "Cliente de venta anotado" }); }
    catch (e) { setVentaMsg({ ok: false, t: e.message }); }
  };
  const deshacerVenta = async () => {
    try { const n = await rpc("deshacer_visita_venta", { p_empleado: regId }); visitas.setN(n); setVentaMsg({ ok: true, t: "Se quitó el último" }); }
    catch (e) { setVentaMsg({ ok: false, t: e.message }); }
  };
  useEffect(() => { setElegida(null); setRazon(null); setOtro(""); }, [dec && dec.id]);
  useEffect(() => { if (!decMsg) return; const t = setTimeout(() => setDecMsg(null), 5000); return () => clearTimeout(t); }, [decMsg]);
  const razonFinal = razon === "Otro" ? otro.trim() : razon;
  const listaDec = elegida && (elegida !== "Ninguno" || (razon && (razon !== "Otro" || otro.trim().length >= 3)));
  const decidir = async (salida) => {
    if (!dec || busy) return;
    const s = salida || elegida;
    if (s === "Ninguno" && !listaDec) return;
    setBusy(true);
    try {
      await rpc("decidir_salida", { p_turno: dec.id, p_empleado: regId, p_salida: s, p_razon: s === "Ninguno" ? razonFinal : null });
      setDecMsg({ ok: true, t: `${dec.cliente_nombre} · se fue con: ${s}${s === "Ninguno" ? " · " + razonFinal : ""}` });
      recargar();
    } catch (e) { setDecMsg({ ok: false, t: e.message }); }
    setBusy(false);
  };
  const pickSalida = (n) => { if (n === "Ninguno") { setElegida("Ninguno"); setRazon(null); setOtro(""); } else decidir(n); };

  const copiarGarantia = async (g) => { setCopiado({ k: g.k, ok: await copiarTexto(g.texto) }); };
  useEffect(() => { if (!copiado) return; const t = setTimeout(() => setCopiado(null), 2500); return () => clearTimeout(t); }, [copiado]);

  useEffect(() => { if (!ventaMsg) return; const t = setTimeout(() => setVentaMsg(null), 4000); return () => clearTimeout(t); }, [ventaMsg]);

  const hint = !ok ? `Falta: ${faltan.join(", ")}`
    : (citado ? "Llegó a tienda (citado por teléfono) · " : "") + (espera === 0 ? "no hay fila, sale de primero en el iPad" : `entra #${espera + 1} en la lista`);
  const kpi = (l, v, color, extra) => (
    <div style={{ ...S.card, borderRadius: 14, boxShadow: "none", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <div style={S.cap}>{l}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color }}>{v}</div>
        {extra}
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      <Header subtitulo="Computadora de recepción">
        {aviso && (
          <button type="button" onClick={() => { setBit("perdidas"); setAviso(null); }}
            style={{ height: 34, padding: "0 12px 0 10px", borderRadius: 17, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...S.dot("#fff") }} />
            {aviso.tiene_voicemail ? "Voicemail" : aviso.tipoAviso === "repite" ? `Volvió a llamar (${aviso.veces})` : "Llamada perdida"} · {fmtTel(aviso.telefono)} · Ver
          </button>
        )}
        {GARANTIAS.map((g) => {
          const est = copiado && copiado.k === g.k ? (copiado.ok ? "ok" : "error") : null;
          return (
            <button key={g.k} type="button" onClick={() => copiarGarantia(g)} title={"Copia el mensaje de " + g.label.toLowerCase() + " para pegarlo"}
              style={{ height: 34, padding: "0 14px", borderRadius: 17, border: `1px solid ${est === "ok" ? "#86C59B" : "#57534E"}`, background: est === "ok" ? C.green : "transparent", color: "#FAFAF9", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, transition: "background 0.2s" }}>
              {est === "ok"
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
              {est === "ok" ? "¡Copiado! Ctrl+V" : est === "error" ? "No se pudo copiar" : g.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setBuscar(true)} style={{ height: 34, padding: "0 14px", borderRadius: 17, border: "1px solid #57534E", background: "transparent", color: "#FAFAF9", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          Buscar cliente
        </button>
      </Header>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 20, padding: "20px 28px" }}>
        {/* ---------- Formulario ---------- */}
        <form onSubmit={(e) => { e.preventDefault(); if (tipo === "ventanilla") crear(); }} style={{ ...S.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>{tipo === "llamada" ? "Nueva llamada" : "Nuevo turno"}</div>
            <label style={{ ...S.cap, display: "flex", alignItems: "center", gap: 8 }}>Registra
              <select value={regId || ""} onChange={(e) => setRegId(Number(e.target.value))} aria-label="Quién registra"
                style={{ ...S.select, width: "auto", height: 38, borderRadius: 19, fontSize: 14, fontWeight: 700, paddingLeft: 14 }}>
                {registradores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
          </div>

          {devolviendo && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, background: C.orangeSoft, color: C.orangeDark, fontSize: 13, flex: "none" }}>
              <div style={{ fontWeight: 700 }}>Atendiendo llamada perdida{devolviendo.tiene_voicemail ? " · voicemail" : ""}</div>
              <div>{fmtTel(devolviendo.telefono)}{devolviendo.nombre_cid ? ` · ${devolviendo.nombre_cid}` : ""} · llamó {devolviendo.veces} {devolviendo.veces === 1 ? "vez" : "veces"}{devolviendo.intentos ? ` · ${devolviendo.intentos} ${devolviendo.intentos === 1 ? "intento" : "intentos"} sin contestar` : ""}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={noContestoAtendiendo} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "none", background: C.orange, color: "#fff", fontSize: 13, fontWeight: 700 }}>{(devolviendo.intentos || 0) >= 2 ? "No contestó · cerrar" : "No contestó"}</button>
                <button type="button" onClick={spamAtendiendo} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2, fontSize: 13, fontWeight: 700 }}>Spam</button>
                <button type="button" onClick={cancelarAtendiendo} style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.orangeDark, fontSize: 12, fontWeight: 700, textDecoration: "underline" }}>Cancelar</button>
              </div>
            </div>
          )}
          <div style={{ ...S.segWrap, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <button type="button" onClick={() => setTipo("ventanilla")} style={S.seg(tipo === "ventanilla")}><span style={S.dot(tipo === "ventanilla" ? C.orange : C.gris)} />Reparación</button>
            <button type="button" onClick={() => setTipo("llamada")} style={S.seg(tipo === "llamada")}><span style={S.dot(tipo === "llamada" ? MORADO : C.gris)} />Llamada</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <label style={S.label}>Teléfono<input type="tel" value={f.telefono} onChange={set("telefono")} placeholder="787-000-0000" style={S.input} /></label>
            <div style={S.label}>Pueblo
              <Combo items={cat.municipios} valueId={fl.municipio_id} onPick={escogerPueblo} label="Pueblo" />
            </div>
          </div>
          <label style={S.label}>Nombre<input value={f.nombre} onChange={set("nombre")} style={S.input} /></label>

          {hist.length > 0 && (
            <div style={{ borderRadius: 12, background: C.moradoSoft, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, color: C.moradoDark, flex: "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MORADO} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
                  Llamó {hist.length} {hist.length === 1 ? "vez" : "veces"} antes
                </div>
                <button type="button" onClick={() => setVerHist(!verHist)} style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 8, background: "transparent", color: MORADO, fontSize: 13, fontWeight: 700 }}>{verHist ? "Ocultar" : "Ver"}</button>
              </div>
              {verHist && hist.slice(0, 2).map((l) => {
                const e = estadoLlamada(l);
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{fmtDia(l.created_at)}</b> · {l.problema || l.modelo || "—"} · {l.registrado_por || "—"}</span>
                    <span style={{ flex: "none", fontWeight: 700, color: e.c }}>{e.t}</span>
                  </div>
                );
              })}
              {verHist && hist.length > 2 && <div style={{ fontSize: 12, fontWeight: 600 }}>y {hist.length - 2} más · búscalo en "Buscar cliente"</div>}
            </div>
          )}
          {cliente && hist.length === 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.greenDark, flex: "none" }}><span style={S.dot(C.green)} />Cliente conocido: {cliente.nombre} · {cliente.pueblo}</div>}

          {tipo === "llamada" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div style={S.label}>Modelo
                  <Combo items={cat.modelos} valueId={fl.modelo_id} onPick={(id) => setFl((p) => ({ ...p, modelo_id: id }))} label="Modelo" />
                </div>
                <label style={S.label}>Hace cuánto la tiene
                  <select value={fl.antiguedad_id} onChange={(e) => setFl({ ...fl, antiguedad_id: e.target.value })} style={S.select}>
                    <option value="">Escoge</option>
                    {cat.antiguedad.map((a) => <option key={a.id} value={a.id}>{a.rango}</option>)}
                  </select>
                </label>
              </div>
              <label style={S.label}>Problema<input value={fl.problema} onChange={(e) => setFl({ ...fl, problema: e.target.value })} placeholder="Breve descripción" style={S.input} /></label>
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {llMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: llMsg.ok ? "#E1F5EE" : C.redSoft, color: llMsg.ok ? "#0F6E56" : C.redDark }}>{llMsg.t}</div>}
                {sinUsuarioLl && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: C.orangeSoft, color: C.orangeDark }}>{regNombre} no tiene usuario en MareyApp. Escoge otra persona en "Registra".</div>}
                <div style={S.cap}>{okL ? "¿Qué pasó? · se guarda en MareyApp" : `Falta: ${faltanL.join(", ")}`}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                  {RESULTADOS_LLAMADA.map((r) => (
                    <button key={r.label} type="button" onClick={() => guardarLlamada(r)} disabled={!okL || busy}
                      style={{ height: 44, padding: "0 8px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, color: "#fff", background: okL ? r.color : C.gris }}>{r.label}</button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={S.label}>Modelo
                <Combo items={modelosCombo} valueId={f.modelo} onPick={(id) => setF((p) => ({ ...p, modelo: id }))} label="Modelo" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={S.cap}>¿Dónde lo compró?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {LUGARES_COMPRA.map((o) => <button key={o} type="button" onClick={() => setF({ ...f, compra: o })} style={S.chip(f.compra === o)}>{o}</button>)}
                </div>
              </div>
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {msg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: msg.ok ? C.greenSoft : C.redSoft, color: msg.ok ? C.greenDark : C.redDark }}>{msg.t}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: ok ? C.muted : C.redDark }}><span style={S.dot(ok ? C.green : C.red)} />{hint}</div>
                <button type="submit" disabled={!ok || busy} style={{ ...S.btn(ok ? C.orange : C.gris), fontSize: 17 }}>{busy ? "Guardando..." : "Crear turno"}</button>
              </div>
            </>
          )}
        </form>

        {/* ---------- Columna derecha ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12, flex: "none" }}>
            {kpi("Por devolver", perdidas.length, perdidas.length ? C.red : C.ink,
              <button type="button" onClick={() => setBit("perdidas")} style={{ height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${perdidas.length ? C.red : C.line2}`, background: perdidas.length ? C.redSoft : "#fff", color: perdidas.length ? C.redDark : C.muted, fontSize: 13, fontWeight: 700, flex: "none" }}>Ver</button>)}
            {kpi("Clientes en espera", espera, C.orangeDark)}
            {kpi("Reparando", arreglando, C.ink)}
            {kpi("Cerrados hoy", cerrados, C.green)}
            {kpi("Clientes de venta", visitas.n, C.blueDark,
              <button type="button" onClick={sumarVenta} title="Toca una vez por cada cliente que vino a comprar o preguntar"
                style={{ height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${C.blue}`, background: C.blueSoft, color: C.blueDark, fontSize: 13, fontWeight: 700, flex: "none" }}>+ 1</button>)}
          </div>
          {ventaMsg && (
            <div style={{ marginTop: -8, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, color: ventaMsg.ok ? C.blueDark : C.redDark, flex: "none" }}>
              {ventaMsg.t}
              {ventaMsg.ok && ventaMsg.t !== "Se quitó el último" && <button type="button" onClick={deshacerVenta} style={{ border: "none", background: "transparent", color: C.faint, fontSize: 12, fontWeight: 700, textDecoration: "underline" }}>Deshacer</button>}
            </div>
          )}

          {dec && (
            <div style={{ flex: "none", background: C.orangeSoft, border: `2px solid ${C.orange}`, borderRadius: 16, boxShadow: "0 14px 30px -18px rgba(180,83,9,0.55)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <div style={{ ...S.cap, color: C.orangeDark, display: "flex", alignItems: "center", gap: 8 }}><span style={S.dot(C.orange)} />Decisión pendiente · {regNombre || "recepción"}{pendientes.length > 1 ? ` · ${pendientes.length} esperando` : ""}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dec.cliente_nombre} no quiso reparar {dec.piezas ? dec.piezas.split(", ").map((n) => (/a$/i.test(n.split(" ")[0]) ? "la " : "el ") + n.toLowerCase()).join(" y ") : "el calentador"}</div>
                  <div style={{ fontSize: 13, color: C.faint }}>{dec.numero} · {nm(dec.modelo_codigo)} · lo revisó {titulo(dec.atendido_por_nombre)} · hace {Math.max(0, Math.floor((now - new Date(dec.terminado_at)) / 60000))} min</div>
                </div>
                <div style={{ flex: "none", fontSize: 14, fontWeight: 700, color: C.orangeDark, paddingTop: 2 }}>¿Con qué se fue el cliente?</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {SALIDAS.map((x) => (
                  <button key={x.n} type="button" disabled={busy || !regId} onClick={() => pickSalida(x.n)}
                    style={{ height: 52, borderRadius: 12, fontSize: 16, fontWeight: 700, color: C.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, background: "#fff",
                      border: elegida === x.n ? `2px solid ${C.orange}` : "1px solid #E7C9A0", boxShadow: elegida === x.n ? "0 6px 14px -10px rgba(180,83,9,0.6)" : "none" }}>
                    {x.n}<span style={{ fontSize: 12, fontWeight: 500, color: C.faint }}>{x.d}</span>
                  </button>
                ))}
              </div>
              {elegida === "Ninguno" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: "1px solid #F1DFC6" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.orangeDark }}>¿Por qué no se llevó ninguno?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {RAZONES_NINGUNO.map((r) => (
                      <button key={r} type="button" onClick={() => { setRazon(r); setOtro(""); }}
                        style={{ height: 38, padding: "0 14px", borderRadius: 19, fontSize: 14, ...(razon === r ? { border: `1px solid ${C.ink}`, background: C.ink, color: "#fff", fontWeight: 700 } : { border: "1px solid #E7C9A0", background: "#fff", color: C.ink2, fontWeight: 500 }) }}>{r}</button>
                    ))}
                    <button type="button" disabled={!listaDec || busy} onClick={() => decidir("Ninguno")}
                      style={{ marginLeft: "auto", height: 40, padding: "0 20px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, color: "#fff", background: listaDec ? C.green : C.gris }}>{busy ? "Guardando..." : "Guardar"}</button>
                  </div>
                  {razon === "Otro" && (
                    <input autoFocus value={otro} onChange={(e) => setOtro(e.target.value)} onKeyDown={(e) => e.key === "Enter" && decidir("Ninguno")} placeholder="Escribe por qué no se llevó ninguno"
                      style={{ ...S.input, height: 44, background: "#fff", border: `2px solid ${C.orange}` }} />
                  )}
                </div>
              )}
            </div>
          )}
          {decMsg && (
            <div style={{ flex: "none", marginTop: -8, fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: decMsg.ok ? C.greenSoft : C.redSoft, color: decMsg.ok ? C.greenDark : C.redDark }}>
              {decMsg.ok ? "Guardado: " : ""}{decMsg.t}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16, flex: "none" }}>
            <div style={{ ...S.card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}><span style={S.dot(C.orange)} />Reparación</div>
                <div style={{ fontSize: 12, color: C.faint }}>Clientes en espera · se reparan en el iPad</div>
              </div>
              {fila.length === 0 && <div style={{ padding: "26px 18px", borderTop: `1px solid ${C.soft2}`, textAlign: "center", fontSize: 14, color: C.faint }}>No hay nadie en la lista.</div>}
              {fila.slice(0, maxFila).map((t) => {
                const proc = t.status === "en_proceso";
                return (
                  <div key={t.id} style={{ borderTop: `1px solid ${C.soft2}` }}>
                    <div style={{ display: "flex", gap: 12, padding: "10px 18px", alignItems: "center" }}>
                      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: C.orange, width: 46, flex: "none" }}>{t.numero}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.cliente_nombre}</div>
                        <div style={{ fontSize: 12, color: C.faint }}>{nm(t.modelo_codigo)}{t.serial ? " · " + t.serial : ""}</div>
                      </div>
                      <span style={S.pill(proc ? C.orangeSoft : C.soft2, proc ? C.orangeDark : C.ink2)}>{proc ? titulo(t.atendido_por_nombre) + " · " + fmtMMSS(now - new Date(t.iniciado_at)) : "Espera " + fmtMMSS(now - new Date(t.created_at))}</span>
                      {anularId !== t.id && <button type="button" onClick={() => setAnularId(t.id)} style={{ flex: "none", height: 32, padding: "0 10px", borderRadius: 16, border: `1px solid ${C.line2}`, background: "#fff", color: C.red, fontSize: 12, fontWeight: 700 }}>Anular</button>}
                    </div>
                    {anularId === t.id && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: C.redSoft }}>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.redDark }}>¿El cliente se fue? Queda en la bitácora como anulado.</div>
                        <button type="button" onClick={() => anular(t)} style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 700 }}>Anular</button>
                        <button type="button" onClick={() => setAnularId(null)} style={{ ...S.ghost, height: 34, fontSize: 13 }}>No</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {fila.length > maxFila && <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.soft2}`, fontSize: 13, fontWeight: 600, color: C.orangeDark }}>+ {fila.length - maxFila} más en la lista</div>}
            </div>
            <Leaderboard titulo="Registros de hoy" rows={lbReg} campo="registros" unidad="registros" max={4} />
          </div>

          {/* Bitácora: la lista se mueve por dentro, la pantalla no */}
          <div style={{ ...S.card, flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 18px", flex: "none" }}>
              <div style={{ display: "flex", gap: 2, background: C.soft2, borderRadius: 10, padding: 3 }}>
                {[["turnos", "Bitácora de hoy"], ["llamadas", "Llamadas"], ["perdidas", "Por devolver"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setBit(k)} style={{ ...S.seg(bit === k), minHeight: 32, padding: "0 14px", fontSize: 13, borderRadius: 8, display: "flex", gap: 6 }}>
                    {l}{k === "perdidas" && perdidas.length > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.red, color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{perdidas.length}</span>}
                  </button>
                ))}
              </div>
              {bit === "llamadas" ? (
                <div style={{ display: "flex", gap: 4 }}>
                  {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["ano", "Año"]].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFiltro(k)} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", fontSize: 12, fontWeight: filtro === k ? 700 : 600, background: filtro === k ? MORADO : "transparent", color: filtro === k ? "#fff" : C.muted }}>{l}</button>
                  ))}
                </div>
              ) : bit === "perdidas" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13, color: C.faint }}>{perdidas.length === 0 ? "Nada pendiente" : `${perdidas.length} por devolver · suena un aviso cuando entra una`}</div>
                  <button type="button" onClick={cargarPerdidas} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: `1px solid ${C.soft2}`, background: "transparent", fontSize: 12, fontWeight: 600, color: C.ink2 }}>Actualizar</button>
                </div>
              )
                : <div style={{ fontSize: 13, color: C.faint }}>{bitacora.length} cerrados hoy</div>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {bit === "perdidas" && <MiniPerdidas abiertas={perdidas} cerradas={perdidasCerr} />}
              {bit === "perdidas" && perdidasVisibles.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.faint, borderTop: `1px solid ${C.soft2}` }}>Todo devuelto. Cuando entre una llamada perdida o un voicemail aparece aquí.</div>}
              {bit === "perdidas" && perdidasVisibles.map((p) => {
                const mia = p.tomada_por && regNombre && p.tomada_por.toLowerCase() === regNombre.toLowerCase();
                const urg = p.estado === "abierta" && (Date.now() - new Date(p.primera_llamada)) > 15 * 60000;
                const btn = (bg, fg, border) => ({ height: 38, padding: "0 16px", borderRadius: 10, border: border || "none", background: bg, color: fg, fontSize: 14, fontWeight: 700, flex: "none" });
                return (
                  <div key={p.id} style={{ padding: "12px 18px", borderTop: `1px solid ${C.soft2}`, borderLeft: urg ? `3px solid ${C.red}` : "3px solid transparent", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>{fmtTel(p.telefono)}</div>
                      {p.nombre_cid && <div style={{ fontSize: 12, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre_cid}</div>}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        <span style={S.pill(p.tiene_voicemail ? C.moradoSoft : C.orangeSoft, p.tiene_voicemail ? C.moradoDark : C.orangeDark)}>{p.tiene_voicemail ? `Voicemail${p.voicemail_seg ? " · " + p.voicemail_seg + "s" : ""}` : "Perdida"}</span>
                        {p.veces > 1 && <span style={S.pill(C.redSoft, C.redDark)}>Llamó {p.veces} veces</span>}
                        {p.intentos > 0 && <span style={S.pill(C.soft2, C.ink2)}>{p.intentos} {p.intentos === 1 ? "intento" : "intentos"} sin contestar</span>}
                        {mia && <span style={S.pill(C.greenSoft, C.greenDark)}>La estás atendiendo</span>}
                      </div>
                      {p.voicemail_url && (audios[p.id]
                        ? <audio controls src={audios[p.id]} style={{ width: "100%", maxWidth: 420, height: 34, marginTop: 8 }} />
                        : <button type="button" onClick={() => escucharVm(p)} style={{ height: 32, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.line2}`, background: "#fff", color: C.moradoDark, fontSize: 13, fontWeight: 700, marginTop: 8 }}>Escuchar voicemail</button>)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flex: "none" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: urg ? C.red : C.ink2 }}>{hace(p.ultima_llamada)}</div>
                        <div style={{ fontSize: 11, color: C.faint }}>{fmtHora(p.ultima_llamada)}</div>
                      </div>
                      {mia
                        ? <button type="button" onClick={() => { if (!devolviendo || devolviendo.id !== p.id) devolver(p); else setTipo("llamada"); }} style={btn("#fff", C.ink2, `1px solid ${C.line2}`)}>Continuar</button>
                        : <button type="button" onClick={() => devolver(p)} style={btn(MORADO, "#fff")}>Atender</button>}
                    </div>
                  </div>
                );
              })}
              {bit === "perdidas" && perdidasCerr.length > 0 && (
                <>
                  <div style={{ ...S.cap, padding: "14px 18px 6px", borderTop: `1px solid ${C.soft2}` }}>Devueltas · últimos 7 días</div>
                  {perdidasCerr.map((p) => {
                    const r = { contestada: ["Devuelta", C.greenSoft, C.greenDark], no_contesta: ["No contestó", C.redSoft, C.redDark], spam: ["Spam", C.soft2, C.ink2], no_aplica: ["No aplica", C.soft2, C.ink2] }[p.resultado] || [p.resultado, C.soft2, C.ink2];
                    return (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "center", fontSize: 13 }}>
                        <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><b>{fmtTel(p.telefono)}</b> <span style={{ color: C.faint }}>· {p.cerrada_por || "—"}{p.minutos_respuesta != null ? ` · ${Math.round(p.minutos_respuesta)} min` : ""}{p.intentos ? ` · ${p.intentos} intentos` : ""} · {fmtDia(p.cerrada_at)} {fmtHora(p.cerrada_at)}</span></div>
                        <span style={S.pill(r[1], r[2])}>{r[0]}</span>
                      </div>
                    );
                  })}
                </>
              )}
              {bit === "llamadas" && lista.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.faint, borderTop: `1px solid ${C.soft2}` }}>No hay llamadas en este periodo.</div>}
              {bit === "llamadas" && lista.map((l) => {
                const e = estadoLlamada(l);
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <div style={{ fontFamily: mono, fontSize: 12, color: C.faint, width: 70, flex: "none" }}>{filtro === "hoy" ? fmtHora(l.created_at) : fmtDia(l.created_at)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{l.cliente_nombre}</div>
                        <div style={{ fontSize: 12, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[l.cliente_telefono, l.municipio, l.modelo].filter(Boolean).join(" · ")}{l.problema ? " · " + l.problema : ""} · registró {l.registrado_por || "—"}</div>
                      </div>
                    </div>
                    <span style={S.pill(e.b, e.c)}>{e.t}</span>
                  </div>
                );
              })}
              {bit === "turnos" && bitacora.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.faint, borderTop: `1px solid ${C.soft2}` }}>Todavía no hay turnos terminados ni anulados.</div>}
              {bit === "turnos" && bitacora.map((t) => {
                const an = t.status === "anulado";
                return (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: C.orange, width: 46, flex: "none" }}>{t.numero}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.cliente_nombre}</div>
                        <div style={{ fontSize: 12, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {an ? nm(t.modelo_codigo) + " · anulado por " + titulo(t.anulado_por_nombre)
                            : [nm(t.modelo_codigo), t.piezas, titulo(t.atendido_por_nombre), t.segundos_servicio != null ? fmtMMSS(t.segundos_servicio * 1000) : null,
                                t.salida ? "se fue con: " + t.salida + (t.razon_salida ? " (" + t.razon_salida + ")" : "") + (t.decidido_por_nombre ? " · decidió " + titulo(t.decidido_por_nombre) : "") : null].filter(Boolean).join(" · ")}
                          {" · registró " + titulo(t.registrado_por_nombre) + " · " + fmtHora(t.terminado_at)}
                        </div>
                      </div>
                    </div>
                    <span style={S.pill(an ? C.redSoft : t.resultado === "Reparado" ? C.greenSoft : t.resultado === "Cliente no quiso reparar" ? "#FAEEDA" : C.soft2, an ? C.redDark : t.resultado === "Reparado" ? C.greenDark : t.resultado === "Cliente no quiso reparar" ? "#854F0B" : C.ink2)}>{an ? "Anulado" : t.resultado === "Cliente no quiso reparar" ? "No quiso reparar" : t.resultado === "Sin pieza dañada, se orientó" ? "Orientación" : t.resultado}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {buscar && (
        <Modal titulo="Expediente del cliente" onClose={() => { setBuscar(false); setQ(""); }}>
          <BuscadorExpediente q={q} setQ={setQ} autoFocus />
          <Expediente q={q} />
        </Modal>
      )}
    </div>
  );
}
