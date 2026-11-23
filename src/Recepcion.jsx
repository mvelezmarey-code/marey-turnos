import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtMMSS, fmtHora, fmtDia, soloDigitos, titulo, hoyPR, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, LUGARES_COMPRA, SALIDAS, RAZONES_NINGUNO, SIN_PIEZA } from "./lib.js";
import { Header, Leaderboard, Expediente, BuscadorExpediente, Modal } from "./components.jsx";
import { catalogoLlamadas, llamadasPorTelefono, llamadasDesde, registrarLlamada, estadoLlamada, esCitado, RESULTADOS_LLAMADA, MORADO,
  perdidasAbiertas, perdidasCerradas, perdidasPorRango, perdidaTomar, perdidaSoltar, perdidaNoContesto, perdidaCerrar, suscribirPerdidas, urlVoicemail, fmtTel, hace, beep } from "./llamadas.js";

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
// Rango de fechas (YYYY-MM-DD en hora de PR) para la bitacora: hoy / semana / mes / rango
const fechaDesdeB = (k) => {
  const hoy = hoyPR();
  const d = new Date(hoy + "T12:00:00");
  if (k === "semana") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (k === "mes") d.setDate(1);
  return d.toISOString().slice(0, 10);
};
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
export function Combo({ items, valueId, onPick, placeholder = "Escribe o escoge", label }) {
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
// Resultados que cuentan como "devuelta y contactada" (incluye el valor viejo 'contestada')
const CONTACTADA = ["atendida", "contestada", "pendiente_tecnico", "ya_atendido"];
const esContactada = (p) => CONTACTADA.includes(p.resultado);
// ---------- Tiempo en devolver una llamada perdida ----------
// Empieza cuando entró la llamada (email de Verve) y termina cuando alguien le dio "Atender" en la app.
// Si no hay "Atender" se usa el intento de "no contestó", y si tampoco, el cierre.
// Solo cuenta horas de trabajo (lunes a sábado, 8:00 a.m. a 5:00 p.m., hora de PR) y solo llamadas desde el 23 de noviembre de 2026.
const DEVOLVER_DESDE = "2026-11-23T00:00:00-04:00";
const HORA_ABRE = 8, HORA_CIERRA = 17;
const PR_MS = 4 * 3600000; // Puerto Rico es UTC-4 todo el año
const SE_LLAMO = ["atendida", "contestada", "pendiente_tecnico", "no_contesta"];
const diaHora = (iso) => (iso ? `${esHoyPR(iso) ? "hoy" : fmtDia(iso)} ${fmtHora(iso)}` : "—");
// Primer momento registrado en que se atendió: [fecha ISO, verbo]
const momentoDevuelta = (p) => {
  const c = [[p.tomada_at, "se atendió"], [p.ultimo_intento, "se le llamó"], [p.cerrada_at, "se cerró"]].filter((x) => x[0]);
  if (!c.length) return null;
  return c.reduce((a, b) => (new Date(b[0]) < new Date(a[0]) ? b : a));
};
// Minutos entre dos momentos contando solo horas de trabajo
const minLaborables = (iniIso, finIso) => {
  const a = new Date(iniIso).getTime() - PR_MS, b = new Date(finIso).getTime() - PR_MS; // reloj de PR sobre UTC
  if (!(b > a)) return 0;
  let total = 0;
  const dia = new Date(a); dia.setUTCHours(0, 0, 0, 0);
  for (let d = dia.getTime(); d <= b; d += 86400000) {
    if (new Date(d).getUTCDay() === 0) continue; // domingo no cuenta
    const ini = Math.max(a, d + HORA_ABRE * 3600000), fin = Math.min(b, d + HORA_CIERRA * 3600000);
    if (fin > ini) total += fin - ini;
  }
  return Math.round(total / 60000);
};
// Minutos que tardó en devolverse (null si entró antes del 23 de noviembre o sigue abierta)
const minDevolver = (p) => {
  if (p.estado !== "cerrada" || !p.primera_llamada || new Date(p.primera_llamada) < new Date(DEVOLVER_DESDE)) return null;
  const m = momentoDevuelta(p);
  return m ? minLaborables(p.primera_llamada, m[0]) : null;
};
// Promedio de las que sí se devolvieron (contestara o no el cliente). "No aplica" y "ya estaba atendido" no entran.
const promDevolver = (lista) => {
  const v = lista.filter((p) => SE_LLAMO.includes(p.resultado)).map(minDevolver).filter((x) => x != null);
  return v.length ? { min: Math.round(v.reduce((x, y) => x + y, 0) / v.length), n: v.length } : null;
};
const entroYSalio = (p) => {
  const m = p.estado === "cerrada" ? momentoDevuelta(p) : null;
  if (!m) return `entró ${diaHora(p.primera_llamada)} · sin devolver`;
  const min = minDevolver(p);
  return `entró ${diaHora(p.primera_llamada)} · ${m[1]} ${diaHora(m[0])}` + (min != null ? ` · ${min} min` : "");
};
// Etiqueta legible de cada resultado de llamada perdida
const RES_LABEL = (r) => ({ atendida: "Devuelta y atendida", contestada: "Devuelta y atendida", pendiente_tecnico: "Pendiente técnico", ya_atendido: "Ya estaba atendido", no_contesta: "Devuelta, no contestó", spam: "No aplica", no_aplica: "No aplica" })[r] || r;
// Colores [fondo, texto] por resultado
const RES_COLOR = (r) => ({ atendida: [C.greenSoft, C.greenDark], contestada: [C.greenSoft, C.greenDark], pendiente_tecnico: [C.orangeSoft, C.orangeDark], ya_atendido: [MORADO + "22", MORADO], no_contesta: [C.redSoft, C.redDark] })[r] || [C.soft2, C.ink2];
function MiniPerdidas({ abiertas, cerradas }) {
  const hoyAb = abiertas.filter((p) => esHoyPR(p.primera_llamada));
  const hoyCe = cerradas.filter((p) => esHoyPR(p.primera_llamada));
  const entraron = hoyAb.length + hoyCe.length;
  const vm = [...hoyAb, ...hoyCe].filter((p) => p.tiene_voicemail).length;
  const dev = hoyCe.filter(esContactada);
  const noCont = hoyCe.filter((p) => p.resultado === "no_contesta").length;
  const pct = entraron ? Math.round(dev.length / entraron * 100) : 0;
  const tiempo = promDevolver(hoyCe);
  const porQuien = (n) => promDevolver(hoyCe.filter((p) => p.cerrada_por === n));
  const por = {};
  hoyCe.forEach((p) => { if (!p.cerrada_por) return; const q = por[p.cerrada_por] || (por[p.cerrada_por] = { dev: 0, otras: 0, min: 0 }); if (esContactada(p)) { q.dev++; q.min += p.minutos_respuesta || 0; } else q.otras++; });
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
        {tile("Promedio en devolver", tiempo ? `${tiempo.min} min` : "—")}
      </div>
      <div style={{ fontSize: 11, color: C.faint }}>Promedio en devolver: desde que entra la llamada hasta que alguien le da "Atender". Solo horas de trabajo. No cuenta las de "no aplica".</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: C.soft2, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.green }} /></div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, flex: "none" }}>{pct}% devueltas</div>
      </div>
      {personas.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
          <span style={{ fontWeight: 700, color: C.ink2 }}>Quién atendió:</span>
          {personas.map(([n, q]) => <span key={n}><b style={{ color: C.ink }}>{titulo(n)}</b> {q.dev} devuelta{q.dev !== 1 ? "s" : ""}{porQuien(n) ? ` · promedio ${porQuien(n).min} min` : ""}{q.otras ? ` · ${q.otras} sin contestar/no aplica` : ""}</span>)}
        </div>
      )}
    </div>
  );
}

// ====================== RESUMEN GERENCIAL ======================
const cuenta = (arr, key) => { const o = {}; arr.forEach((x) => { const k = typeof key === "function" ? key(x) : x[key]; if (k == null || k === "") return; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
const diaSemana = (iso) => ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][new Date(iso).getDay()];
const porDia = (arr, getIso) => { const o = {}; arr.forEach((x) => { const d = diaSemana(getIso(x)); o[d] = (o[d] || 0) + 1; }); return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].filter((d) => o[d]).map((d) => [d, o[d]]); };
function Barras({ pairs, color, total }) {
  if (!pairs.length) return <div style={{ fontSize: 13, color: C.faint, padding: "2px 0" }}>Sin datos</div>;
  const mx = Math.max.apply(null, pairs.map((p) => p[1]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "130px 1fr 92px", gap: 10, alignItems: "center", fontSize: 13 }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo(k)}</span>
          <div style={{ height: 10, background: C.soft2, borderRadius: 5, overflow: "hidden" }}><div style={{ height: "100%", width: Math.round(v / mx * 100) + "%", background: color, borderRadius: 5 }} /></div>
          <span style={{ fontFamily: mono, fontSize: 12, textAlign: "right", color: C.ink2 }}>{v}{total ? ` · ${Math.round(v / total * 100)}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}
const Chip = ({ l, v, c }) => <span style={{ fontSize: 12, color: C.muted, background: C.soft, border: `1px solid ${C.soft2}`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}><b style={{ fontSize: 13, color: c || C.ink }}>{v}</b> {l}</span>;
// Encabezado de sección de la lista de perdidas: banda suave, punto de color, título, conteo y descripción
const SecHead = ({ dot, t, n, d }) => (
  <div style={{ padding: "13px 18px 12px", background: C.soft, borderTop: `1px solid ${C.soft2}`, display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flex: "none" }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>{t}</span>
      {n != null && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: C.muted, background: C.card, border: `1px solid ${C.line2}`, borderRadius: 999, padding: "1px 9px" }}>{n}</span>}
    </div>
    {d && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, paddingLeft: 17 }}>{d}</div>}
  </div>
);

function ResumenView({ T, L, P, abiertasCount, cargando, onDetalle }) {
  const Tv = T.filter((t) => t.status === "terminado");
  const anulados = T.length - Tv.length;
  const nRes = (r) => Tv.filter((t) => t.resultado === r).length;
  const minProm = Tv.length ? Math.round(Tv.reduce((a, t) => a + (t.segundos_servicio || 0), 0) / Tv.length / 60) : null;
  const dev = P.filter(esContactada);
  const noc = P.filter((p) => p.resultado === "no_contesta").length;
  const noAplica = P.filter((p) => p.resultado === "spam" || p.resultado === "no_aplica").length;
  const atendidasN = P.filter((p) => p.resultado === "atendida" || p.resultado === "contestada").length;
  const pendTec = P.filter((p) => p.resultado === "pendiente_tecnico").length;
  const yaAt = P.filter((p) => p.resultado === "ya_atendido").length;
  const abiertasN = P.filter((p) => p.estado !== "cerrada").length;
  const vmP = P.filter((p) => p.tiene_voicemail).length;
  const pct = P.length ? Math.round(dev.length / P.length * 100) : 0;
  const nLl = (txt) => L.filter((l) => estadoLlamada(l).t === txt).length;
  // pivot: una fila por persona
  const per = {};
  const P_ = (nm) => { const k = titulo((nm || "—").toLowerCase()); return per[k] || (per[k] = { v: 0, t: 0, d: 0, min: 0 }); };
  Tv.forEach((t) => P_(t.registrado_por_nombre).v++);
  L.forEach((l) => P_(l.registrado_por).t++);
  dev.forEach((p) => { const q = P_(p.cerrada_por); q.d++; q.min += p.minutos_respuesta || 0; });
  const lista = Object.entries(per).sort((a, b) => (b[1].v + b[1].t + b[1].d) - (a[1].v + a[1].t + a[1].d));
  const lead = { v: 0, t: 0, d: 0 };
  if (lista.length > 1) ["v", "t", "d"].forEach((k) => { lead[k] = Math.max.apply(null, lista.map((e) => e[1][k])); });
  const tecs = cuenta(Tv.filter((t) => t.resultado !== SIN_PIEZA), "atendido_por_nombre");

  const can = { border: `1px solid ${C.line2}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0, background: C.card };
  const ch = { fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 8 };
  const bign = { fontSize: 34, fontWeight: 700, letterSpacing: -1, lineHeight: 1, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" };
  const small = { fontSize: 13, fontWeight: 500, color: C.muted, letterSpacing: 0 };
  const detBtn = { marginLeft: "auto", height: 26, padding: "0 10px", borderRadius: 13, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2, fontSize: 12, fontWeight: 600, textTransform: "none", letterSpacing: 0 };
  const cell = (v, k) => <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${C.soft2}`, padding: "11px 16px", fontSize: 16, fontWeight: v ? (lead[k] && v === lead[k] ? 800 : 600) : 400, color: v ? (lead[k] && v === lead[k] ? C.green : C.ink) : C.faint }}>{v || "–"}</td>;

  // Reporte en lenguaje natural de las llamadas perdidas
  const nPlural = (n, s, p2) => `${n} ${n === 1 ? s : (p2 || s + "s")}`;
  const reporte = [];
  reporte.push(`Entraron ${nPlural(P.length, "llamada perdida")}${vmP ? ` (${vmP} con voicemail)` : ""}.`);
  if (dev.length) {
    const sub = [];
    if (atendidasN) sub.push(`${atendidasN} se resolvieron o se enviaron a un centro`);
    if (pendTec) sub.push(`${pendTec} pasaron a técnicos`);
    if (yaAt) sub.push(`${yaAt} ya no necesitaban ayuda`);
    reporte.push(`Se les devolvió la llamada a ${dev.length} (${pct}%)${sub.length ? ": " + sub.join(", ") : ""}.`);
  }
  if (noc) reporte.push(`A ${noc} se les llamó y no contestaron.`);
  if (noAplica) reporte.push(`${noAplica} no aplicaban (número malo, repetida o basura).`);
  if (abiertasN) reporte.push(`${abiertasN === 1 ? "Queda 1 llamada" : `Quedan ${abiertasN} llamadas`} sin devolver.`);

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${C.soft2}` }}>
      {cargando && <div style={{ fontSize: 13, color: C.faint }}>Cargando…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={can}>
          <div style={ch}><span style={S.dot(C.orange)} />Ventanilla<button type="button" onClick={() => onDetalle("ventanilla")} style={detBtn}>Detalle</button></div>
          <div style={bign}>{Tv.length}<span style={small}>atendidos</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Chip l="reparados" v={nRes("Reparado")} c={C.green} /><Chip l="no quiso" v={nRes("Cliente no quiso reparar")} c={C.orangeDark} /><Chip l="orientación" v={nRes(SIN_PIEZA)} /><Chip l="anulados" v={anulados} c={anulados ? C.red : C.ink} /><Chip l="min/cliente" v={minProm != null ? minProm : "—"} />
          </div>
        </div>
        <div style={can}>
          <div style={ch}><span style={S.dot(MORADO)} />Por teléfono<button type="button" onClick={() => onDetalle("telefono")} style={detBtn}>Detalle</button></div>
          <div style={bign}>{L.length}<span style={small}>llamadas</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Chip l="a San Juan" v={nLl("Dirigido a San Juan")} c={C.green} /><Chip l="a San Germán" v={nLl("Dirigido a San Germán")} c={C.blueDark} /><Chip l="a técnicos" v={nLl("Pendiente")} c={C.orangeDark} /><Chip l="se resolvió" v={nLl("Resuelto")} c={C.green} />
          </div>
        </div>
        <div style={can}>
          <div style={ch}><span style={S.dot(C.red)} />Perdidas y voicemail<button type="button" onClick={() => onDetalle("perdidas")} style={detBtn}>Detalle</button></div>
          <div style={bign}>{dev.length}<span style={small}>devueltas de {P.length}</span>
            <span style={{ flex: 1, minWidth: 60, height: 8, background: C.soft2, borderRadius: 4, overflow: "hidden", alignSelf: "center" }}><span style={{ display: "block", height: "100%", width: pct + "%", background: C.green }} /></span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{pct}%</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Chip l="voicemail" v={vmP} c={C.moradoDark} /><Chip l="sin contestar" v={noc} c={noc ? C.red : C.ink} /><Chip l="no aplica" v={noAplica} /><Chip l="abiertas ahora" v={abiertasCount} c={abiertasCount ? C.red : C.ink} />
          </div>
        </div>
      </div>

      <div style={{ background: C.soft, border: `1px solid ${C.soft2}`, borderRadius: 14, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, flex: "none" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Llamadas perdidas · resumen</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.6, paddingLeft: 17 }}>{reporte.join(" ")}</div>
      </div>

      <div style={{ border: `1px solid ${C.line2}`, borderRadius: 14, padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: 10, background: C.card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>Quién atendió</b>
          <span style={{ fontSize: 12, color: C.muted }}>clientes por canal</span>
        </div>
        <div style={{ overflowX: "auto", border: `1px solid ${C.line2}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "11px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: C.muted, fontWeight: 700, background: C.soft, borderBottom: `1px solid ${C.line2}` }}>Persona</th>
              {["Ventanilla", "Teléfono", "Devueltas", "Total"].map((h) => <th key={h} style={{ textAlign: "right", padding: "11px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: C.muted, fontWeight: 700, background: C.soft, borderBottom: `1px solid ${C.line2}`, borderLeft: `1px solid ${C.soft2}` }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 16, color: C.faint }}>Sin datos en el periodo</td></tr>}
              {lista.map(([nm, q], i) => (
                <tr key={nm} style={{ background: i % 2 ? C.soft : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 28, height: 28, borderRadius: 14, background: C.orange, color: "#fff", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{nm[0]}</span>{nm}</td>
                  {cell(q.v, "v")}{cell(q.t, "t")}{cell(q.d, "d")}
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${C.soft2}`, padding: "11px 16px", fontSize: 17, fontWeight: 800, background: C.soft2 }}>{q.v + q.t + q.d}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${C.line2}` }}>
              <td style={{ padding: "11px 16px", fontWeight: 800, background: C.soft }}>Total</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${C.soft2}`, padding: "11px 16px", fontWeight: 800, background: C.soft }}>{Tv.length}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${C.soft2}`, padding: "11px 16px", fontWeight: 800, background: C.soft }}>{L.length}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${C.soft2}`, padding: "11px 16px", fontWeight: 800, background: C.soft }}>{dev.length}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${C.soft2}`, padding: "11px 16px", fontSize: 17, fontWeight: 800, background: C.soft2 }}>{Tv.length + L.length + dev.length}</td>
            </tr></tfoot>
          </table>
        </div>
        {tecs.length > 0 && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${C.soft2}` }}><span style={S.cap}>Reparó</span>{tecs.map(([t, v]) => <Chip key={t} l={titulo(t)} v={v} />)}</div>}
      </div>
    </div>
  );
}

function DetalleModal({ seccion, T, L, P, periodoLabel, esHoy, onClose }) {
  const Tv = T.filter((t) => t.status === "terminado");
  const dev = P.filter(esContactada);
  const fmt = (iso) => esHoy ? fmtHora(iso) : fmtDia(iso);
  const Sec = ({ t, children }) => <div style={{ display: "flex", flexDirection: "column", gap: 7 }}><div style={S.cap}>{t}</div>{children}</div>;
  const Lista = ({ rows }) => rows.length === 0 ? null : (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={S.cap}>Registros{rows.length >= 40 ? " · primeros 40" : ""}</div>
      <div style={{ border: `1px solid ${C.line2}`, borderRadius: 10, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
        {rows.slice(0, 40).map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 12px", borderTop: i ? `1px solid ${C.soft2}` : "none" }}>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.a}</div><div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.b}</div></div>
            <span style={S.pill(r.bg, r.fg)}>{r.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
  let titulo_, color, body;
  if (seccion === "ventanilla") {
    titulo_ = "Ventanilla"; color = C.orange;
    body = <>
      <Sec t="Resultado"><Barras pairs={cuenta(T, (t) => t.status === "anulado" ? "Anulado" : t.resultado)} color={color} total={T.length} /></Sec>
      <Sec t="Quién registró"><Barras pairs={cuenta(Tv, "registrado_por_nombre")} color={color} total={Tv.length} /></Sec>
      <Sec t="Quién reparó"><Barras pairs={cuenta(Tv.filter((t) => t.resultado !== SIN_PIEZA), "atendido_por_nombre")} color={C.orangeDark} /></Sec>
      <Sec t="Por día"><Barras pairs={porDia(Tv, (t) => t.fecha + "T12:00:00")} color={color} /></Sec>
      <Lista rows={T.map((t) => ({ a: `${t.numero} · ${t.cliente_nombre}`, b: `${t.modelo_codigo || ""} · ${titulo(t.atendido_por_nombre || "—")} · registró ${titulo(t.registrado_por_nombre || "—")} · ${fmt(t.terminado_at || t.created_at)}`, tag: t.status === "anulado" ? "Anulado" : t.resultado === SIN_PIEZA ? "Orientación" : t.resultado, bg: t.status === "anulado" ? C.redSoft : t.resultado === "Reparado" ? C.greenSoft : t.resultado === "Cliente no quiso reparar" ? C.orangeSoft : C.soft2, fg: t.status === "anulado" ? C.redDark : t.resultado === "Reparado" ? C.greenDark : t.resultado === "Cliente no quiso reparar" ? C.orangeDark : C.ink2 }))} />
    </>;
  } else if (seccion === "telefono") {
    titulo_ = "Por teléfono"; color = MORADO;
    body = <>
      <Sec t="Resultado"><Barras pairs={cuenta(L, (l) => estadoLlamada(l).t)} color={color} total={L.length} /></Sec>
      <Sec t="Quién atendió"><Barras pairs={cuenta(L, "registrado_por")} color={color} total={L.length} /></Sec>
      <Sec t="Por día"><Barras pairs={porDia(L, (l) => l.created_at)} color={color} /></Sec>
      <Lista rows={L.map((l) => { const st = estadoLlamada(l); return { a: `${l.cliente_nombre} · ${fmtTel(l.cliente_telefono)}`, b: `${[l.municipio, l.problema].filter(Boolean).join(" · ")} · atendió ${titulo(l.registrado_por || "—")} · ${fmt(l.created_at)}`, tag: st.t, bg: st.b, fg: st.c }; })} />
    </>;
  } else {
    titulo_ = "Perdidas y voicemail"; color = C.red;
    body = <>
      <Sec t="Resultado"><Barras pairs={cuenta(P, (p) => p.estado !== "cerrada" ? "Abierta" : RES_LABEL(p.resultado))} color={color} total={P.length} /></Sec>
      <Sec t="Quién devolvió"><Barras pairs={cuenta(dev, "cerrada_por")} color={C.green} total={dev.length} /></Sec>
      <Sec t="Por día"><Barras pairs={porDia(P, (p) => p.primera_llamada)} color={color} /></Sec>
      <Lista rows={P.map((p) => { const [bg, fg] = p.estado !== "cerrada" ? [C.soft2, C.ink2] : RES_COLOR(p.resultado); return { a: `${fmtTel(p.telefono)}${p.nombre_cid ? " · " + p.nombre_cid : ""}`, b: `${p.tiene_voicemail ? "voicemail · " : ""}${entroYSalio(p)}${p.estado === "cerrada" ? " · " + titulo(p.cerrada_por || "—") : ""}`, tag: p.estado !== "cerrada" ? "Abierta" : RES_LABEL(p.resultado), bg, fg }; })} />
    </>;
  }
  return (
    <Modal titulo={titulo_} onClose={onClose} ancho={620}>
      <div style={{ ...S.cap, marginTop: -4 }}>{periodoLabel}</div>
      {body}
    </Modal>
  );
}

// Tooltip al pasar el mouse (Recepción usa estilos inline, el CSS se inyecta una vez)
const TIP_CSS = `
.rtipw{position:relative;display:inline-flex}
.rtipw>.rtip{position:absolute;bottom:calc(100% + 8px);left:0;min-width:210px;max-width:280px;background:#1C1917;color:#fff;font-size:12px;font-weight:500;line-height:1.4;text-align:left;padding:10px 12px;border-radius:10px;box-shadow:0 12px 30px -12px rgba(0,0,0,.5);opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .15s,transform .15s;z-index:60;pointer-events:none}
.rtipw>.rtip b{color:#fff;font-weight:700}
.rtipw>.rtip::after{content:"";position:absolute;top:100%;left:22px;border:6px solid transparent;border-top-color:#1C1917}
.rtipw:hover>.rtip,.rtipw:focus-within>.rtip{opacity:1;visibility:visible;transform:translateY(0)}
`;
function Tip({ texto, children, style }) {
  return <span className="rtipw" style={style}>{children}<span className="rtip" dangerouslySetInnerHTML={{ __html: texto }} /></span>;
}
const TIP_RES = {
  "Enviado a San Juan": "Se le dio la solución: el cliente va al centro de <b>San Juan</b>. Queda como <b>Devuelta y atendida</b>.",
  "Enviado a San Germán": "Se le dio la solución: el cliente va al centro de <b>San Germán</b>. Queda como <b>Devuelta y atendida</b>.",
  "Referido a técnicos": "El caso pasa al <b>equipo técnico</b>. Queda como <b>Devuelta · pendiente técnico</b> hasta que el técnico lo llame.",
  "Se resolvió": "El problema se resolvió <b>en la misma llamada</b>. Queda como <b>Devuelta y atendida</b>.",
};

export default function Recepcion() {
  const { empleados, modelos } = useCatalogos();
  const { abiertos, hoy, recargar } = useTurnos();
  const lbReg = useLeaderboard("leaderboard_registros_hoy");
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

  // ---------- Bitacora de turnos por periodo (hoy viene en vivo de useTurnos; el resto se consulta) ----------
  const [filtroB, setFiltroB] = useState("hoy");
  const [rangoB, setRangoB] = useState({ desde: fechaDesdeB("mes"), hasta: hoyPR() });
  const [bitLista, setBitLista] = useState([]);
  const [bitCargando, setBitCargando] = useState(false);
  useEffect(() => {
    if (bit !== "turnos" || filtroB === "hoy") return;
    const desde = filtroB === "rango" ? rangoB.desde : fechaDesdeB(filtroB);
    const hasta = filtroB === "rango" ? rangoB.hasta : hoyPR();
    if (!desde || !hasta) return;
    setBitCargando(true);
    supabase.from("turnos_completos").select("*").eq("tipo", "ventanilla").in("status", ["terminado", "anulado"]).gte("fecha", desde).lte("fecha", hasta)
      .order("terminado_at", { ascending: false }).limit(1000)
      .then(({ data }) => { setBitLista(data || []); setBitCargando(false); });
  }, [bit, filtroB, rangoB]);

  // ---------- Resumen gerencial (periodo propio: ventanilla + teléfono + perdidas) ----------
  const [filtroR, setFiltroR] = useState("hoy");
  const [rangoR, setRangoR] = useState({ desde: fechaDesdeB("mes"), hasta: hoyPR() });
  const [resT, setResT] = useState([]); const [resL, setResL] = useState([]); const [resP, setResP] = useState([]);
  const [resCargando, setResCargando] = useState(false);
  const [detalleSec, setDetalleSec] = useState(null);
  const rDesde = filtroR === "rango" ? rangoR.desde : filtroR === "hoy" ? hoyPR() : fechaDesdeB(filtroR);
  const rHasta = filtroR === "rango" ? rangoR.hasta : hoyPR();
  const perLabelR = filtroR === "hoy" ? "hoy" : filtroR === "semana" ? "esta semana" : filtroR === "mes" ? "este mes" : `${rangoR.desde} a ${rangoR.hasta}`;
  useEffect(() => {
    if (bit !== "resumen" || !rDesde || !rHasta) return;
    let vivo = true; setResCargando(true);
    const tope = new Date(rHasta + "T23:59:59-04:00").getTime();
    Promise.all([
      supabase.from("turnos_completos").select("*").eq("tipo", "ventanilla").in("status", ["terminado", "anulado"]).gte("fecha", rDesde).lte("fecha", rHasta).order("terminado_at", { ascending: false }).limit(2000).then(({ data }) => data || []),
      llamadasDesde(rDesde + "T00:00:00-04:00").then((d) => (d || []).filter((l) => new Date(l.created_at).getTime() <= tope)).catch(() => []),
      perdidasPorRango(rDesde, rHasta).catch(() => []),
    ]).then(([t, l, p]) => { if (!vivo) return; setResT(t); setResL(l); setResP(p); setResCargando(false); });
    return () => { vivo = false; };
  }, [bit, filtroR, rangoR, rDesde, rHasta]);

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
  const esHistorial = filtroB !== "hoy";
  const bitVista = esHistorial ? bitLista : bitacora;
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
  // Si una llamada lleva mas de LOCK_MIN minutos "tomada" sin cerrarse, se considera abandonada y vuelve a la lista de todos.
  const LOCK_MIN = 15;
  const ahoraMs = Date.now();
  const noCerradas = perdidas.filter((p) => {
    const mia = regNombre && p.tomada_por && p.tomada_por.toLowerCase() === regNombre.toLowerCase();
    const abandonada = p.estado === "tomada" && (!p.tomada_at || (ahoraMs - new Date(p.tomada_at).getTime()) > LOCK_MIN * 60000);
    return p.estado === "abierta" || mia || abandonada;
  });
  // Nuevas: nunca se han llamado. Reintento: ya se les llamó y no contestaron (dormidas o listas para decidir).
  const perdidasNuevas = noCerradas.filter((p) => (p.intentos || 0) === 0);
  const perdidasReintento = noCerradas
    .filter((p) => (p.intentos || 0) >= 1)
    .sort((a, b) => ((b.intentos || 0) >= 2 ? 1 : 0) - ((a.intentos || 0) >= 2 ? 1 : 0));
  const perdidasVisibles = noCerradas;

  // Una fila de la lista de perdidas (se reusa en Nuevas y en Reintento)
  const filaPerdida = (p) => {
    const mia = p.tomada_por && regNombre && p.tomada_por.toLowerCase() === regNombre.toLowerCase();
    const decidir = (p.intentos || 0) >= 2 && p.estado !== "cerrada";
    const dormida = p.dormida_hasta && new Date(p.dormida_hasta).getTime() > ahoraMs;
    const minsFalta = dormida ? Math.max(1, Math.ceil((new Date(p.dormida_hasta).getTime() - ahoraMs) / 60000)) : 0;
    const urg = decidir || (!dormida && p.estado === "abierta" && (ahoraMs - new Date(p.primera_llamada)) > 15 * 60000);
    const btn = (bg, fg, border) => ({ height: 38, padding: "0 16px", borderRadius: 10, border: border || "none", background: bg, color: fg, fontSize: 14, fontWeight: 700, flex: "none" });
    return (
      <div key={p.id} style={{ padding: "12px 18px", borderTop: `1px solid ${C.soft2}`, borderLeft: urg ? `3px solid ${C.red}` : "3px solid transparent", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>{fmtTel(p.telefono)}</div>
          {p.nombre_cid && <div style={{ fontSize: 12, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre_cid}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <span style={S.pill(p.tiene_voicemail ? C.moradoSoft : C.orangeSoft, p.tiene_voicemail ? C.moradoDark : C.orangeDark)}>{p.tiene_voicemail ? `Voicemail${p.voicemail_seg ? " · " + p.voicemail_seg + "s" : ""}` : "Perdida"}</span>
            {p.veces > 1 && <span style={S.pill(C.redSoft, C.redDark)}>Llamó {p.veces} veces</span>}
            {decidir && <span style={S.pill(C.redSoft, C.redDark)}>{p.intentos} intentos · decidir</span>}
            {!decidir && dormida && <span style={S.pill(C.orangeSoft, C.orangeDark)}>{p.intentos} {p.intentos === 1 ? "intento" : "intentos"} · vuelve en {minsFalta} min</span>}
            {!decidir && !dormida && p.intentos > 0 && <span style={S.pill(C.soft2, C.ink2)}>{p.intentos} {p.intentos === 1 ? "intento" : "intentos"} sin contestar</span>}
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
            ? <button type="button" onClick={() => devolver(p)} style={btn("#fff", C.ink2, `1px solid ${C.line2}`)}>Continuar</button>
            : <button type="button" onClick={() => devolver(p)} style={btn(decidir ? C.red : MORADO, "#fff")}>{decidir ? "Decidir" : "Atender"}</button>}
        </div>
      </div>
    );
  };

  // Atender: la toma (desaparece de la lista del otro) y abre el formulario de llamada con el telefono puesto
  const devolver = (p) => {
    setDevolviendo(p); setBit("perdidas"); setLlMsg(null);
    setF({ ...vacio, telefono: fmtTel(p.telefono) }); setFl(vacioL); setCliente(null);
    if (p.estado === "abierta" && regNombre) perdidaTomar(p.id, regNombre).then(cargarPerdidas).catch(() => {});
  };
  const accionPerdida = async (fn) => { try { await fn(); } catch (e) { setLlMsg({ ok: false, t: e.message }); } cargarPerdidas(); };
  const limpiarAtendiendo = () => { setDevolviendo(null); setF(vacio); setFl(vacioL); setHist([]); setCliente(null); setBit("perdidas"); };
  // No contestó: la función RPC ya suma el intento y la deja dormida 30 min (1er) o lista para decidir (2do). Nunca cierra sola.
  const noContestoAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(async () => {
      const n = await perdidaNoContesto(p.id, regNombre);
      setLlMsg({ ok: true, t: n >= 2 ? `${fmtTel(p.telefono)} llegó al 2do intento. Queda para decidir.` : `${fmtTel(p.telefono)} no contestó. Vuelve a la lista dormida 30 min.` });
    });
    limpiarAtendiendo();
  };
  // Decisión tras el 2do intento: cerrar como "Devuelta, no contestó"
  const cerrarNoContestoAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(() => perdidaCerrar(p.id, "no_contesta", regNombre));
    setLlMsg({ ok: true, t: `${fmtTel(p.telefono)} cerrada: no contestó en 2 intentos.` });
    limpiarAtendiendo();
  };
  // Ya estaba atendido: el cliente ya había sido atendido o lo resolvió por su cuenta.
  const yaAtendidoAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(() => perdidaCerrar(p.id, "ya_atendido", regNombre));
    setLlMsg({ ok: true, t: `${fmtTel(p.telefono)} cerrada: ya estaba atendido.` });
    limpiarAtendiendo();
  };
  // No aplica: número equivocado, llamada repetida o basura.
  const noAplicaAtendiendo = async () => {
    const p = devolviendo; if (!p) return;
    await accionPerdida(() => perdidaCerrar(p.id, "no_aplica", regNombre));
    setLlMsg({ ok: true, t: `${fmtTel(p.telefono)} marcada como no aplica.` });
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
      // San Juan / San Germán / Se resolvió = atendida. Referido a técnicos = pendiente del técnico.
      const resPerdida = r.status === "pendiente_willy" ? "pendiente_tecnico" : "atendida";
      if (dv) { try { await perdidaCerrar(dv.id, resPerdida, regNombre, idL); } catch (_) { /* no bloquea el guardado */ } }
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, flex: "none" }}>
            {kpi("Por devolver", perdidasVisibles.length, perdidasVisibles.length ? C.red : C.ink,
              <button type="button" onClick={() => setBit("perdidas")} style={{ height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${perdidasVisibles.length ? C.red : C.line2}`, background: perdidasVisibles.length ? C.redSoft : "#fff", color: perdidasVisibles.length ? C.redDark : C.muted, fontSize: 13, fontWeight: 700, flex: "none" }}>Ver</button>)}
            {kpi("Clientes en espera", espera, C.orangeDark)}
            {kpi("Reparando", arreglando, C.ink)}
            {kpi("Cerrados hoy", cerrados, C.green)}
          </div>

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
                      {/* Modelo, teléfono y cliente con el mismo peso */}
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", columnGap: 18, rowGap: 4, alignItems: "flex-end" }}>
                        {[["Modelo", nm(t.modelo_codigo) || "—", "0 0 auto"], ["Teléfono", fmtTel(t.cliente_telefono) || "—", "0 0 auto"], ["Cliente", t.cliente_nombre, "1 1 130px"]].map(([l, v, fx]) => (
                          <div key={l} style={{ flex: fx, minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>{l}</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
                          </div>
                        ))}
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
                {[["resumen", "Resumen"], ["turnos", "Turnos"], ["llamadas", "Llamadas"], ["perdidas", "Por devolver"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setBit(k)} style={{ ...S.seg(bit === k), minHeight: 32, padding: "0 14px", fontSize: 13, borderRadius: 8, display: "flex", gap: 6 }}>
                    {l}{k === "perdidas" && perdidasVisibles.length > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.red, color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{perdidasVisibles.length}</span>}
                  </button>
                ))}
              </div>
              {bit === "resumen" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {filtroR === "rango" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="date" value={rangoR.desde} max={rangoR.hasta} onChange={(e) => setRangoR({ ...rangoR, desde: e.target.value })} aria-label="Desde" style={{ ...S.input, height: 30, width: 140, fontSize: 12, padding: "0 8px" }} />
                      <span style={{ fontSize: 12, color: C.faint }}>a</span>
                      <input type="date" value={rangoR.hasta} min={rangoR.desde} max={hoyPR()} onChange={(e) => setRangoR({ ...rangoR, hasta: e.target.value })} aria-label="Hasta" style={{ ...S.input, height: 30, width: 140, fontSize: 12, padding: "0 8px" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["rango", "Rango"]].map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setFiltroR(k)} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", fontSize: 12, fontWeight: filtroR === k ? 700 : 600, background: filtroR === k ? C.orange : "transparent", color: filtroR === k ? "#fff" : C.muted }}>{l}</button>
                    ))}
                  </div>
                </div>
              ) : bit === "llamadas" ? (
                <div style={{ display: "flex", gap: 4 }}>
                  {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["ano", "Año"]].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFiltro(k)} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", fontSize: 12, fontWeight: filtro === k ? 700 : 600, background: filtro === k ? MORADO : "transparent", color: filtro === k ? "#fff" : C.muted }}>{l}</button>
                  ))}
                </div>
              ) : bit === "perdidas" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13, color: C.faint }}>{perdidasVisibles.length === 0 ? "Nada pendiente" : `${perdidasVisibles.length} por devolver · suena un aviso cuando entra una`}</div>
                  <button type="button" onClick={cargarPerdidas} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: `1px solid ${C.soft2}`, background: "transparent", fontSize: 12, fontWeight: 600, color: C.ink2 }}>Actualizar</button>
                </div>
              )
                : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 13, color: C.faint }}>{bitCargando ? "Cargando..." : esHistorial ? `${bitLista.length} en el periodo` : `${bitacora.length} cerrados hoy`}</div>
                    {filtroB === "rango" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="date" value={rangoB.desde} max={rangoB.hasta} onChange={(e) => setRangoB({ ...rangoB, desde: e.target.value })} aria-label="Desde" style={{ ...S.input, height: 30, width: 140, fontSize: 12, padding: "0 8px" }} />
                        <span style={{ fontSize: 12, color: C.faint }}>a</span>
                        <input type="date" value={rangoB.hasta} min={rangoB.desde} max={hoyPR()} onChange={(e) => setRangoB({ ...rangoB, hasta: e.target.value })} aria-label="Hasta" style={{ ...S.input, height: 30, width: 140, fontSize: 12, padding: "0 8px" }} />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["rango", "Rango"]].map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setFiltroB(k)} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", fontSize: 12, fontWeight: filtroB === k ? 700 : 600, background: filtroB === k ? C.orange : "transparent", color: filtroB === k ? "#fff" : C.muted }}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {bit === "resumen" && <ResumenView T={resT} L={resL} P={resP} abiertasCount={perdidas.filter((p) => p.estado !== "cerrada").length} cargando={resCargando} onDetalle={setDetalleSec} />}
              {bit === "perdidas" && <MiniPerdidas abiertas={perdidas} cerradas={perdidasCerr} />}
              {bit === "perdidas" && perdidasVisibles.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.faint, borderTop: `1px solid ${C.soft2}` }}>Todo devuelto. Cuando entre una llamada perdida o un voicemail aparece aquí.</div>}
              {bit === "perdidas" && perdidasNuevas.length > 0 && (
                <>
                  <SecHead dot={C.orange} t="Nuevas" n={perdidasNuevas.length} d="Perdidas y voicemails que todavía nadie ha devuelto." />
                  {perdidasNuevas.map(filaPerdida)}
                </>
              )}
              {bit === "perdidas" && perdidasReintento.length > 0 && (
                <>
                  <SecHead dot={C.red} t="Se llamó · el cliente no contestó" n={perdidasReintento.length} d="Ya se les devolvió la llamada y no contestaron · esperan el 2do intento o una decisión." />
                  {perdidasReintento.map(filaPerdida)}
                </>
              )}
              {bit === "perdidas" && perdidasCerr.length > 0 && (
                <>
                  <SecHead dot={C.green} t="Atendidas · últimos 7 días" n={perdidasCerr.length} d={"Devueltas y cerradas." + (promDevolver(perdidasCerr) ? ` Promedio en devolver desde el 23 nov: ${promDevolver(perdidasCerr).min} min (${promDevolver(perdidasCerr).n} llamadas).` : "")} />
                  {perdidasCerr.map((p) => {
                    const [rbg, rfg] = RES_COLOR(p.resultado); const r = [RES_LABEL(p.resultado), rbg, rfg];
                    return (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "center", fontSize: 13 }}>
                        <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><b>{fmtTel(p.telefono)}</b> <span style={{ color: C.faint }}>· {entroYSalio(p)} · {p.cerrada_por || "—"}{p.intentos ? ` · ${p.intentos} intentos` : ""}</span></div>
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
              {bit === "turnos" && bitVista.length === 0 && !bitCargando && <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.faint, borderTop: `1px solid ${C.soft2}` }}>{esHistorial ? "No hay turnos en este periodo." : "Todavía no hay turnos terminados ni anulados."}</div>}
              {bit === "turnos" && bitVista.map((t) => {
                const an = t.status === "anulado";
                return (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: C.orange, width: 46, flex: "none" }}>{t.numero}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span>{t.cliente_nombre}</span>
                          {(t.cliente_telefono || t.telefono) && <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: C.ink2 }}>{fmtTel(t.cliente_telefono || t.telefono)}</span>}
                          {esHistorial && <span style={{ fontSize: 12, fontWeight: 500, color: C.faint }}>{fmtDia(t.terminado_at || t.created_at)}</span>}
                        </div>
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

      {/* ---------- Detalle de una sección del resumen ---------- */}
      {detalleSec && <DetalleModal seccion={detalleSec} T={resT} L={resL} P={resP} periodoLabel={perLabelR} esHoy={filtroR === "hoy"} onClose={() => setDetalleSec(null)} />}

      {/* ---------- Atender llamada perdida: ventana con la info del cliente ---------- */}
      {devolviendo && (
        <Modal titulo={`Atender · ${fmtTel(devolviendo.telefono)}`} onClose={cancelarAtendiendo} ancho={620} align="center">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "min(560px, 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: C.ink2 }}>
              <span>
                <span style={S.pill(devolviendo.tiene_voicemail ? C.moradoSoft : C.orangeSoft, devolviendo.tiene_voicemail ? C.moradoDark : C.orangeDark)}>{devolviendo.tiene_voicemail ? "Voicemail" : "Perdida"}</span>
                {devolviendo.nombre_cid ? ` ${devolviendo.nombre_cid} ·` : ""} llamó {devolviendo.veces} {devolviendo.veces === 1 ? "vez" : "veces"}{devolviendo.intentos ? ` · ${devolviendo.intentos} ${devolviendo.intentos === 1 ? "intento" : "intentos"} sin contestar` : ""}
              </span>
              <span style={{ ...S.cap, display: "flex", alignItems: "center", gap: 8 }}>Atiende
                <select value={regId || ""} onChange={(e) => setRegId(Number(e.target.value))} aria-label="Quién atiende" style={{ ...S.select, width: "auto", height: 34, borderRadius: 17, fontSize: 13, fontWeight: 700, paddingLeft: 12 }}>
                  {registradores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </span>
            </div>
            {devolviendo.voicemail_url && (audios[devolviendo.id]
              ? <audio controls src={audios[devolviendo.id]} style={{ width: "100%", height: 34 }} />
              : <button type="button" onClick={() => escucharVm(devolviendo)} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.line2}`, background: "#fff", color: C.moradoDark, fontSize: 13, fontWeight: 700, alignSelf: "flex-start" }}>Escuchar voicemail</button>)}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <label style={S.label}>Teléfono<input type="tel" value={f.telefono} onChange={set("telefono")} style={{ ...S.input, fontWeight: 700 }} /></label>
              <div style={S.label}>Pueblo<Combo items={cat.municipios} valueId={fl.municipio_id} onPick={escogerPueblo} label="Pueblo" /></div>
            </div>
            <label style={S.label}>Nombre<input autoFocus value={f.nombre} onChange={set("nombre")} style={S.input} /></label>
            {hist.length > 0 && <div style={{ fontSize: 13, color: C.moradoDark, fontWeight: 600 }}>Llamó {hist.length} {hist.length === 1 ? "vez" : "veces"} antes · {hist[0].problema || hist[0].modelo || ""} · {estadoLlamada(hist[0]).t}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div style={S.label}>Modelo<Combo items={cat.modelos} valueId={fl.modelo_id} onPick={(id) => setFl((p) => ({ ...p, modelo_id: id }))} label="Modelo" /></div>
              <label style={S.label}>Hace cuánto la tiene
                <select value={fl.antiguedad_id} onChange={(e) => setFl({ ...fl, antiguedad_id: e.target.value })} style={S.select}>
                  <option value="">Escoge</option>
                  {cat.antiguedad.map((a) => <option key={a.id} value={a.id}>{a.rango}</option>)}
                </select>
              </label>
            </div>
            <label style={S.label}>Problema<input value={fl.problema} onChange={(e) => setFl({ ...fl, problema: e.target.value })} placeholder="Breve descripción" style={S.input} /></label>

            {llMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: llMsg.ok ? "#E1F5EE" : C.redSoft, color: llMsg.ok ? "#0F6E56" : C.redDark }}>{llMsg.t}</div>}
            {sinUsuarioLl && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: C.orangeSoft, color: C.orangeDark }}>{regNombre} no tiene usuario en MareyApp. Escoge otra persona en "Atiende".</div>}
            <style>{TIP_CSS}</style>
            <div style={S.cap}>{okL ? "¿Qué pasó? · se guarda y la llamada queda devuelta" : `Falta: ${faltanL.join(", ")}`}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {RESULTADOS_LLAMADA.map((r) => (
                <Tip key={r.label} texto={TIP_RES[r.label] || r.label} style={{ display: "block" }}>
                  <button type="button" onClick={() => guardarLlamada(r)} disabled={!okL || busy}
                    style={{ width: "100%", height: 46, padding: "0 8px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, color: "#fff", background: okL ? r.color : C.gris }}>{r.label}</button>
                </Tip>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 10, borderTop: `1px solid ${C.soft2}`, flexWrap: "wrap" }}>
              {(devolviendo.intentos || 0) >= 2
                ? <Tip texto="Se intentó <b>2 veces</b> y el cliente no contestó. Se cierra como <b>Devuelta, no contestó</b>."><button type="button" onClick={cerrarNoContestoAtendiendo} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 700 }}>Cerrar · no contestó</button></Tip>
                : <Tip texto="El cliente no cogió. <b>1er intento:</b> vuelve dormida 30 min. <b>2do intento:</b> queda para decidir."><button type="button" onClick={noContestoAtendiendo} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "none", background: C.orange, color: "#fff", fontSize: 13, fontWeight: 700 }}>No contestó</button></Tip>}
              <Tip texto="El cliente <b>ya había sido atendido</b> o lo resolvió por su cuenta. Se cierra como contactado, sin gestión nueva."><button type="button" onClick={yaAtendidoAtendiendo} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 700 }}>Ya estaba atendido</button></Tip>
              <Tip texto="Número equivocado, llamada repetida o basura. Se descarta."><button type="button" onClick={noAplicaAtendiendo} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2, fontSize: 13, fontWeight: 700 }}>No aplica</button></Tip>
              <button type="button" onClick={cancelarAtendiendo} style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: "underline" }}>Cancelar · vuelve a la lista</button>
            </div>
          </div>
        </Modal>
      )}

      {buscar && (
        <Modal titulo="Expediente del cliente" onClose={() => { setBuscar(false); setQ(""); }}>
          <BuscadorExpediente q={q} setQ={setQ} autoFocus />
          <Expediente q={q} />
        </Modal>
      )}
    </div>
  );
}
