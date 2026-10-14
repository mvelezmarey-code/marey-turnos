import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtFecha, soloDigitos, titulo, useNow, fmtHora } from "./lib.js";
import { llamadasPorTelefono, estadoLlamada, MORADO } from "./llamadas.js";

export function Header({ subtitulo, children }) {
  const now = useNow(15000);
  return (
    <header style={{ height: 64, flex: "none", background: C.ink, color: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 0.5 }}>TURNOS</div>
        <div style={{ background: C.orange, color: "#fff", fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 6 }}>SERVICIO VENTANILLA</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 14 }}>
        {children}
        <div style={{ color: C.line2 }}>{subtitulo}</div>
        <div style={{ fontFamily: mono, fontSize: 18 }}>{fmtHora(now)}</div>
      </div>
    </header>
  );
}

// Leaderboard tipo podio: 2do | 1ro | 3ro, y el resto en filas con barra
export function Leaderboard({ titulo: t, rows, campo, unidad, mostrarResto = false }) {
  const ord = [...rows].sort((a, b) => b[campo] - a[campo]);
  const top = ord[0] ? ord[0][campo] : 0;
  const medal = ["#CA8A04", "#A8A29E", "#C2410C"];
  const alto = [96, 72, 56];
  const podio = [[ord[1], 1], [ord[0], 0], [ord[2], 2]].filter(([r]) => r);
  return (
    <div style={{ ...S.card, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t}</div>
        <div style={{ fontSize: 12, color: C.faint }}>Hoy</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, alignItems: "end" }}>
        {podio.map(([r, i]) => (
          <div key={r.nombre} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, textAlign: "center" }}>{r.nombre}</div>
            <div style={{ fontSize: 13, color: C.faint, fontFamily: mono }}>{r[campo]} {unidad}</div>
            <div style={{ width: "100%", height: alto[i], borderRadius: "8px 8px 0 0", background: medal[i], display: "flex", justifyContent: "center", paddingTop: 8, fontSize: 26, fontWeight: 700, fontFamily: mono }}>{i + 1}</div>
          </div>
        ))}
      </div>
      {mostrarResto && ord.slice(3).map((r, i) => (
        <div key={r.nombre} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.soft }}>
          <div style={{ width: 28, fontFamily: mono, fontWeight: 700, color: C.muted }}>{i + 4}</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{r.nombre}</div>
            <div style={{ height: 6, background: C.soft2, borderRadius: 3 }}><div style={{ height: "100%", borderRadius: 3, background: C.faint, width: (top ? Math.round(r[campo] / top * 100) : 0) + "%" }} /></div>
          </div>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 16 }}>{r[campo]}</div>
        </div>
      ))}
    </div>
  );
}

// Buscador de expediente: teléfono, serie o nombre
export function Expediente({ q }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const qq = q.trim(); const qd = soloDigitos(qq);
      if (qq.length < 3) { setRows(null); return; }
      let query = supabase.from("expediente_turnos").select("*").order("created_at", { ascending: false }).limit(200);
      if (qd.length >= 4) query = query.or(`telefono.ilike.%${qd}%,serial.ilike.%${qd}%`);
      else query = query.ilike("nombre", `%${qq}%`);
      const { data } = await query;
      const turnos = (data || []).map((r) => ({ ...r, _k: "t" + r.turno_id }));
      // Llamadas de MareyApp de esos teléfonos (y del número buscado)
      const tels = [...new Set(turnos.map((r) => r.telefono).concat(qd.length === 10 ? [qd] : []))].slice(0, 5);
      const ll = (await Promise.all(tels.map((t) => llamadasPorTelefono(t).catch(() => [])))).flat();
      const llamadas = ll.map((l) => ({ _k: "l" + l.id, tipo: "llamada", telefono: soloDigitos(l.cliente_telefono).slice(-10), nombre: l.cliente_nombre, pueblo: l.municipio,
        modelo_codigo: l.modelo, created_at: l.created_at, llamada: l }));
      setRows(turnos.concat(llamadas).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  if (!rows) return null;
  if (rows.length === 0) return <div style={{ ...S.card, padding: 24, textAlign: "center", fontSize: 14, color: C.muted }}>No hay ningún cliente ni llamada con ese teléfono, serie o nombre.</div>;
  const porTel = {};
  rows.forEach((r) => { (porTel[r.telefono] = porTel[r.telefono] || []).push(r); });
  const estado = (r) => r.status === "anulado" ? ["Anulado", C.redSoft, C.redDark]
    : r.status === "terminado" ? [r.resultado, C.greenSoft, C.greenDark]
    : [r.status === "espera" ? "En espera" : "En proceso", C.orangeSoft, C.orangeDark];
  return Object.entries(porTel).map(([tel, ev]) => {
    const f = ev[0];
    const series = [...new Set(ev.map((e) => e.serial).filter(Boolean))];
    const modelos = [...new Set(ev.map((e) => e.modelo_codigo).filter(Boolean))];
    const nRep = ev.filter((e) => e.tipo === "ventanilla").length, nLl = ev.filter((e) => e.tipo === "llamada").length, nVen = ev.length - nRep - nLl;
    return (
      <div key={tel} style={{ ...S.card, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{f.nombre}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>Expediente</div>
          </div>
          <div style={{ fontSize: 14, color: C.ink2 }}>{tel} · {f.pueblo}{modelos.length ? " · " + modelos.join(", ") : ""}{series.length ? " · Serie " + series.join(", ") : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <div style={{ borderRadius: 10, padding: "8px 10px", background: "#EEEDFE", color: "#3C3489" }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono }}>{nLl}</div><div style={{ fontSize: 12, fontWeight: 600 }}>Llamadas</div></div>
            <div style={{ borderRadius: 10, padding: "8px 10px", background: C.orangeSoft, color: C.orangeDark }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono }}>{nRep}</div><div style={{ fontSize: 12, fontWeight: 600 }}>Reparaciones</div></div>
            <div style={{ borderRadius: 10, padding: "8px 10px", background: C.blueSoft, color: C.blueDark }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono }}>{nVen}</div><div style={{ fontSize: 12, fontWeight: 600 }}>Ventas</div></div>
          </div>
        </div>
        {ev.map((e) => {
          if (e.tipo === "llamada") {
            const l = e.llamada, st = estadoLlamada(l);
            return (
              <div key={e._k} style={{ display: "flex", gap: 12, padding: "12px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "flex-start" }}>
                <span style={{ flex: "none", width: 92, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "4px 0", borderRadius: 6, color: "#fff", background: MORADO }}>Llamada</span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{[l.modelo, l.antiguedad].filter(Boolean).join(" · ")}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{l.problema || "Sin problema anotado"}</div>
                  <div style={{ fontSize: 12, color: "#A8A29E" }}>Registró: {l.registrado_por || "—"}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: st.b, color: st.c }}>{st.t}</span>
                  <div style={{ fontSize: 11, color: "#A8A29E", marginTop: 4 }}>{fmtFecha(l.created_at)}</div>
                </div>
              </div>
            );
          }
          const [txt, bg, fg] = estado(e);
          const rep = e.tipo === "ventanilla";
          return (
            <div key={e._k} style={{ display: "flex", gap: 12, padding: "12px 18px", borderTop: `1px solid ${C.soft2}`, alignItems: "flex-start" }}>
              <span style={{ flex: "none", width: 92, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "4px 0", borderRadius: 6, color: "#fff", background: rep ? C.orange : C.blue }}>{rep ? "Reparación" : "Venta"}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{rep ? `${e.modelo_codigo} · Serie ${e.serial}` : `Venta · ${e.busca}`}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{rep ? [e.piezas || "—", e.causa ? "Causa: " + e.causa : null, e.lugar_compra ? "Compró en " + e.lugar_compra : null].filter(Boolean).join(" · ") : e.tipo_cliente}</div>
                <div style={{ fontSize: 12, color: "#A8A29E" }}>{e.numero}{e.atendido_por ? " · Atendió: " + titulo(e.atendido_por) : ""}</div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{txt}</span>
                <div style={{ fontSize: 11, color: "#A8A29E", marginTop: 4 }}>{fmtFecha(e.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  });
}

export function BuscadorExpediente({ q, setQ }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", ...S.card, padding: "8px 10px" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por teléfono, número de serie o nombre" aria-label="Buscar cliente"
        style={{ flex: 1, height: 40, border: "none", outline: "none", fontSize: 15, background: "transparent" }} />
      {q && <button type="button" onClick={() => setQ("")} style={{ ...S.ghost, height: 36, fontSize: 13 }}>Cerrar</button>}
    </div>
  );
}

// Teclado de PIN de 3 dígitos
export function PinPad({ pin, setPin, onOk, okLabel, okColor = C.orange, ready }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpiar", "0", "Borrar"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 18, padding: "4px 0" }}>
        {[0, 1, 2].map((i) => <div key={i} style={i < pin.length ? { width: 22, height: 22, borderRadius: "50%", background: C.ink } : { width: 22, height: 22, borderRadius: "50%", border: "2px solid #A8A29E" }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {keys.map((k) => {
          const alt = k === "Limpiar" || k === "Borrar";
          return (
            <button key={k} type="button"
              onClick={() => (k === "Limpiar" ? setPin("") : k === "Borrar" ? setPin(pin.slice(0, -1)) : pin.length < 3 && setPin(pin + k))}
              style={{ height: 58, borderRadius: 10, border: `1px solid ${C.line}`, background: alt ? "#fff" : C.soft, fontSize: alt ? 15 : 24, fontWeight: 600, fontFamily: alt ? "inherit" : mono, color: alt ? C.ink2 : C.ink }}>{k}</button>
          );
        })}
      </div>
      <button type="button" onClick={onOk} style={{ ...S.btn(ready ? okColor : "#A8A29E"), height: 56, fontSize: 17 }}>{okLabel}</button>
    </div>
  );
}
