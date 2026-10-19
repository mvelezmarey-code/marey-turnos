import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, TZ, hoyPR, rpc, titulo } from "./lib.js";
import { Header, PinPad, Expediente, BuscadorExpediente } from "./components.jsx";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const IDLE_MS = 5 * 60 * 1000;

function PinGate({ onOk }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [fallos, setFallos] = useState(0);
  const [bloqueoHasta, setBloqueoHasta] = useState(0);
  const bloqueado = Date.now() < bloqueoHasta;
  const entrar = async () => {
    if (bloqueado) return setMsg("Demasiados intentos. Espera unos minutos.");
    if (pin.length !== 3) return setMsg("Pon los 3 dígitos");
    try {
      const rows = await rpc("verificar_pin", { p_pin: pin, p_rol: "admin" });
      if (rows && rows[0]) { onOk(rows[0]); return; }
      const n = fallos + 1; setFallos(n); setPin("");
      if (n >= 5) { setBloqueoHasta(Date.now() + 5 * 60 * 1000); setFallos(0); setMsg("Demasiados intentos. Bloqueado 5 minutos."); }
      else setMsg("PIN incorrecto o sin permiso de admin");
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...S.card, borderRadius: 16, padding: 28, width: 380, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700 }}>Administración</div>
        <div style={{ textAlign: "center", fontSize: 15, color: C.ink2 }}>Entra con tu PIN de ponchar.</div>
        <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: C.red, minHeight: 18 }}>{msg}</div>
        <PinPad pin={pin} setPin={(v) => { setPin(v); setMsg(""); }} onOk={entrar} ready={pin.length === 3 && !bloqueado} okLabel="Entrar" okColor={C.ink} />
      </div>
    </div>
  );
}

function rango(periodo) {
  const hoy = hoyPR();
  const d = new Date(hoy + "T12:00:00");
  if (periodo === "hoy") return hoy;
  if (periodo === "semana") { const lunes = new Date(d); lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return lunes.toISOString().slice(0, 10); }
  const x = new Date(d); x.setDate(d.getDate() - (periodo === "mes" ? 28 : 84)); return x.toISOString().slice(0, 10);
}

export default function Admin() {
  const [admin, setAdmin] = useState(null);
  const [periodo, setPeriodo] = useState("mes");
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [costo, setCosto] = useState("");
  const [margen, setMargen] = useState("");
  const timer = useRef(null);

  // Cierre automático por inactividad
  useEffect(() => {
    if (!admin) return;
    const reset = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setAdmin(null), IDLE_MS); };
    reset();
    ["mousemove", "keydown", "touchstart", "click"].forEach((ev) => window.addEventListener(ev, reset));
    return () => { clearTimeout(timer.current); ["mousemove", "keydown", "touchstart", "click"].forEach((ev) => window.removeEventListener(ev, reset)); };
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    supabase.from("turnos_completos").select("id,fecha,tipo,status,resultado,created_at,busca").gte("fecha", rango(periodo)).limit(10000)
      .then(({ data }) => setRows(data || []));
  }, [admin, periodo]);

  const m = useMemo(() => {
    const val = rows.filter((r) => r.status !== "anulado");
    const dias = new Set(rows.map((r) => r.fecha));
    const porDia = DIAS.map((nombre, i) => {
      const deDia = val.filter((r) => ((new Date(r.fecha + "T12:00:00").getDay() + 6) % 7) === i);
      const nDias = [...dias].filter((f) => ((new Date(f + "T12:00:00").getDay() + 6) % 7) === i).length || 1;
      return { nombre, v: deDia.filter((r) => r.tipo === "ventanilla").length / nDias, b: deDia.filter((r) => r.tipo === "venta").length / nDias, total: deDia.length, nDias };
    });
    const max = Math.max(1, ...porDia.map((d) => Math.max(d.v, d.b)));
    const semana = porDia.slice(0, 5).reduce((a, d) => a + d.v + d.b, 0) / 5;
    const sab = porDia[5];
    const cuenta = (tipo) => { const o = {}; rows.filter((r) => r.tipo === tipo && (r.status === "terminado" || r.status === "anulado")).forEach((r) => { const k = r.status === "anulado" ? "Anulado" : r.resultado; o[k] = (o[k] || 0) + 1; }); return o; };
    const sabRows = val.filter((r) => ((new Date(r.fecha + "T12:00:00").getDay() + 6) % 7) === 5);
    const sabVentas = sabRows.filter((r) => r.tipo === "venta" && r.status === "terminado");
    const compraSab = sabVentas.length ? sabVentas.filter((r) => r.resultado === "Compró").length / sabVentas.length : null;
    const semVentas = val.filter((r) => r.tipo === "venta" && r.status === "terminado" && ((new Date(r.fecha + "T12:00:00").getDay() + 6) % 7) < 5);
    const compraSem = semVentas.length ? semVentas.filter((r) => r.resultado === "Compró").length / semVentas.length : null;
    const horas = {}; sabRows.forEach((r) => { const h = Number(new Date(r.created_at).toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })); horas[h] = (horas[h] || 0) + 1; });
    return { total: val.length, porDia, max, semana, sab, resV: cuenta("ventanilla"), resB: cuenta("venta"), compraSab, compraSem, horas, sabRows, nSab: sab.nDias };
  }, [rows]);

  const pct = (a, b) => (b ? Math.round(a / b * 100) + "%" : "—");
  const sabTotal = m.sab.v + m.sab.b;
  const comprasPorSab = m.nSab ? m.sabRows.filter((r) => r.tipo === "venta" && r.resultado === "Compró").length / m.nSab : 0;
  const c = parseFloat(costo), g = parseFloat(margen);
  const be = c > 0 && g > 0 ? c / g : null;

  const barras = (obj, color) => {
    const tot = Object.values(obj).reduce((a, b) => a + b, 0);
    if (!tot) return <div style={{ fontSize: 13, color: C.muted }}>Sin datos en este periodo.</div>;
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
      <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>{k}</span><span style={{ fontFamily: mono }}>{n} · {pct(n, tot)}</span></div>
        <div style={{ height: 10, background: C.soft2, borderRadius: 4 }}><div style={{ height: "100%", width: pct(n, tot), background: k === "Anulado" ? C.red : color, borderRadius: 4 }} /></div>
      </div>
    ));
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <Header subtitulo={admin ? "Admin · " + titulo(admin.nombre) : "Administración"}>
        {admin && <button type="button" onClick={() => setAdmin(null)} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #57534E", background: "transparent", color: C.line, fontSize: 13 }}>Salir</button>}
      </Header>
      {!admin ? <PinGate onOk={setAdmin} /> : (
        <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Último mes"], ["12s", "Últimas 12 semanas"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPeriodo(k)} style={{ height: 40, padding: "0 14px", borderRadius: 8, border: periodo === k ? "none" : `1px solid ${C.line2}`, background: periodo === k ? C.ink : "#fff", color: periodo === k ? "#fff" : C.ink2, fontSize: 14, fontWeight: 600 }}>{l}</button>
            ))}
          </div>
          <BuscadorExpediente q={q} setQ={setQ} />
          {q.trim().length >= 3 && <Expediente q={q} />}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[["Visitas en el periodo", m.total, "sin anulados"], ["Promedio lunes a viernes", m.semana.toFixed(1), "clientes por día"], ["Promedio sábado", sabTotal.toFixed(1), m.nSab + " sábados con datos"], ["Sábado vs día de semana", pct(sabTotal, m.semana), "del volumen de un día normal"]].map(([l, v, s]) => (
              <div key={l} style={{ ...S.card, padding: "16px 18px" }}><div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 32, fontWeight: 700, fontFamily: mono, marginTop: 4 }}>{v}</div><div style={{ fontSize: 13, color: C.muted }}>{s}</div></div>
            ))}
          </div>

          <section style={{ ...S.card, borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 18 }}>Visitas por día de la semana (promedio)</h2>
              <div style={{ display: "flex", gap: 16, fontSize: 13, color: C.ink2 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C.orange, display: "inline-block" }} />Reparación</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: C.blue, display: "inline-block" }} />Venta</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, alignItems: "end", height: 240, borderBottom: `1px solid ${C.line2}` }}>
              {m.porDia.map((d) => (
                <div key={d.nombre} title={`${d.nombre}: ${d.v.toFixed(1)} reparación, ${d.b.toFixed(1)} venta por día`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end", borderRadius: "8px 8px 0 0", ...(d.nombre === "Sábado" ? { background: C.soft2, outline: `2px dashed ${C.ink}`, outlineOffset: -2 } : {}) }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono }}>{(d.v + d.b).toFixed(1)}</div>
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 190, width: "100%", justifyContent: "center" }}>
                    <div style={{ width: "38%", maxWidth: 40, height: Math.round(d.v / m.max * 180), background: C.orange, borderRadius: "4px 4px 0 0" }} />
                    <div style={{ width: "38%", maxWidth: 40, height: Math.round(d.b / m.max * 180), background: C.blue, borderRadius: "4px 4px 0 0" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>{m.porDia.map((d) => <div key={d.nombre} style={{ textAlign: "center", fontSize: 14, fontWeight: d.nombre === "Sábado" ? 700 : 400 }}>{d.nombre}</div>)}</div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 18 }}>
            <section style={{ ...S.card, borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ fontSize: 18 }}>Razón de la visita</h2>
              <h3 style={{ fontSize: 15, color: C.orangeDark }}>Reparación · resultado</h3>
              {barras(m.resV, C.orange)}
              <h3 style={{ fontSize: 15, color: C.blueDark, marginTop: 8 }}>Venta · resultado</h3>
              {barras(m.resB, C.blue)}
            </section>
            <section style={{ ...S.card, border: `2px solid ${C.ink}`, borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ fontSize: 18 }}>Sábados: ¿vale la pena abrir?</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["Clientes por sábado", sabTotal.toFixed(1)], ["Compras por sábado", comprasPorSab.toFixed(1)], ["% compra en sábado", m.compraSab == null ? "—" : Math.round(m.compraSab * 100) + "%"], ["% compra en semana", m.compraSem == null ? "—" : Math.round(m.compraSem * 100) + "%"]].map(([l, v]) => (
                  <div key={l} style={{ background: C.soft, borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 700, fontFamily: mono }}>{v}</div></div>
                ))}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Clientes por hora (sábados del periodo)</div>
              {Object.keys(m.horas).length === 0 ? <div style={{ fontSize: 13, color: C.muted }}>Todavía no hay sábados con datos.</div> :
                Object.entries(m.horas).sort((a, b) => a[0] - b[0]).map(([h, n]) => (
                  <div key={h} style={{ display: "grid", gridTemplateColumns: "90px 1fr 40px", gap: 10, alignItems: "center", fontSize: 13 }}>
                    <span>{((h % 12) || 12) + (h < 12 ? " AM" : " PM")}</span>
                    <div style={{ height: 14, background: C.soft2, borderRadius: 4 }}><div style={{ height: "100%", width: (n / Math.max(...Object.values(m.horas)) * 100) + "%", background: C.ink2, borderRadius: 4 }} /></div>
                    <span style={{ fontFamily: mono, textAlign: "right" }}>{n}</span>
                  </div>
                ))}
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Punto de equilibrio</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={S.label}>Costo de abrir un sábado ($)<input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} style={S.input} /></label>
                  <label style={S.label}>Ganancia promedio por venta ($)<input type="number" value={margen} onChange={(e) => setMargen(e.target.value)} style={S.input} /></label>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, padding: "12px 14px", borderRadius: 10, background: be == null ? C.soft2 : comprasPorSab >= be ? C.greenSoft : C.redSoft, color: be == null ? C.ink2 : comprasPorSab >= be ? C.greenDark : C.redDark }}>
                  {be == null ? "Pon el costo de abrir y la ganancia por venta para ver cuántas compras hacen falta cada sábado."
                    : `Hacen falta ${be.toFixed(1)} compras por sábado. Hoy el promedio es ${comprasPorSab.toFixed(1)} (${comprasPorSab >= be ? "cubre el costo" : "no cubre el costo"}).`}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
