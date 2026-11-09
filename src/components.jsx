import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtFecha, soloDigitos, titulo, useNow, fmtHora } from "./lib.js";
import { llamadasPorTelefono, estadoLlamada, MORADO } from "./llamadas.js";

export function Header({ subtitulo, children }) {
  const now = useNow(15000);
  return (
    <header style={{ height: 56, flex: "none", background: C.ink, color: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: 1 }}>COLA DE TURNOS</div>
        <div style={{ width: 1, height: 18, background: "#44403C" }} />
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "#F5B971" }}>REPARACIÓN VENTANILLA</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 13 }}>
        {children}
        <div style={{ color: "#A8A29E" }}>{subtitulo}</div>
        <div style={{ fontFamily: mono, fontSize: 15 }}>{fmtHora(now)}</div>
      </div>
    </header>
  );
}

// Leaderboard en filas con barra (el primero en naranja)
export function Leaderboard({ titulo: t, rows, campo, unidad, max = 5 }) {
  const ord = [...rows].sort((a, b) => b[campo] - a[campo]).slice(0, max);
  const top = ord[0] ? ord[0][campo] : 0;
  return (
    <div style={{ ...S.card, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t}</div>
        <div style={{ fontSize: 12, color: C.faint }}>{unidad} · hoy</div>
      </div>
      {ord.length === 0 && <div style={{ fontSize: 13, color: C.faint, padding: "8px 0" }}>Todavía nadie hoy.</div>}
      {ord.map((r, i) => (
        <div key={r.nombre} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: `1px solid ${C.soft2}` }}>
          <div style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: i === 0 ? C.orange : C.soft2, color: i === 0 ? "#fff" : C.muted }}>{i + 1}</div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo(r.nombre)}</div>
          <div style={{ width: 80, height: 6, borderRadius: 3, background: C.soft2, overflow: "hidden", flex: "none" }}>
            <div style={{ height: "100%", borderRadius: 3, width: (top ? Math.round(r[campo] / top * 100) : 0) + "%", background: i === 0 ? C.orange : C.gris }} />
          </div>
          <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 600, width: 24, textAlign: "right" }}>{r[campo]}</div>
        </div>
      ))}
    </div>
  );
}

// Ventana encima de la pantalla (para el expediente)
export function Modal({ titulo: t, onClose, children, ancho = 760 }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(28,25,23,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t}
        style={{ width: ancho, maxWidth: "100%", maxHeight: "100%", background: C.bg, borderRadius: 20, boxShadow: "0 30px 60px -20px rgba(28,25,23,0.45)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "#fff", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t}</div>
          <button type="button" onClick={onClose} style={{ ...S.ghost, height: 38 }}>Cerrar</button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
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
  if (!rows) return <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.faint }}>Escribe al menos 3 letras o números.</div>;
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
    const tiles = [["Llamadas", nLl, C.moradoSoft, C.moradoDark], ["Reparaciones", nRep, C.orangeSoft, C.orangeDark]].concat(nVen ? [["Ventas (antes)", nVen, C.blueSoft, C.blueDark]] : []);
    return (
      <div key={tel} style={{ ...S.card, overflow: "hidden", flex: "none" }}>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{f.nombre}</div>
            <div style={S.cap}>Expediente</div>
          </div>
          <div style={{ fontSize: 14, color: C.ink2 }}>{tel} · {f.pueblo}{modelos.length ? " · " + modelos.join(", ") : ""}{series.length ? " · Serie " + series.join(", ") : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 8 }}>
            {tiles.map(([l, n, bg, fg]) => (
              <div key={l} style={{ borderRadius: 12, padding: "8px 12px", background: bg, color: fg }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono }}>{n}</div><div style={{ fontSize: 12, fontWeight: 600 }}>{l}</div></div>
            ))}
          </div>
        </div>
        {ev.map((e) => {
          if (e.tipo === "llamada") {
            const l = e.llamada, st = estadoLlamada(l);
            return (
              <div key={e._k} style={{ display: "flex", gap: 12, padding: "12px 20px", borderTop: `1px solid ${C.soft2}`, alignItems: "flex-start" }}>
                <span style={{ flex: "none", width: 96, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "4px 0", borderRadius: 8, color: MORADO, background: C.moradoSoft }}>Llamada</span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{[l.modelo, l.antiguedad].filter(Boolean).join(" · ")}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{l.problema || "Sin problema anotado"}</div>
                  <div style={{ fontSize: 12, color: C.faint }}>Registró: {l.registrado_por || "—"}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <span style={S.pill(st.b, st.c)}>{st.t}</span>
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{fmtFecha(l.created_at)}</div>
                </div>
              </div>
            );
          }
          const [txt, bg, fg] = estado(e);
          const rep = e.tipo === "ventanilla";
          return (
            <div key={e._k} style={{ display: "flex", gap: 12, padding: "12px 20px", borderTop: `1px solid ${C.soft2}`, alignItems: "flex-start" }}>
              <span style={{ flex: "none", width: 96, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "4px 0", borderRadius: 8, color: rep ? C.orangeDark : C.blueDark, background: rep ? C.orangeSoft : C.blueSoft }}>{rep ? "Reparación" : "Venta"}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{rep ? `${e.modelo_codigo}${e.serial ? " · Serie " + e.serial : ""}` : `Venta · ${e.busca}`}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{rep ? [e.piezas || "—", e.causa ? "Causa: " + e.causa : null, e.lugar_compra ? "Compró en " + e.lugar_compra : null].filter(Boolean).join(" · ") : e.tipo_cliente}</div>
                <div style={{ fontSize: 12, color: C.faint }}>{e.numero}{e.atendido_por ? " · Atendió: " + titulo(e.atendido_por) : ""}</div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <span style={S.pill(bg, fg)}>{txt}</span>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{fmtFecha(e.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  });
}

export function BuscadorExpediente({ q, setQ, autoFocus = false }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", ...S.card, padding: "6px 8px 6px 16px", flex: "none" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por teléfono, número de serie o nombre" aria-label="Buscar cliente"
        style={{ flex: 1, height: 40, border: "none", outline: "none", fontSize: 15, background: "transparent", boxShadow: "none" }} />
      {q && <button type="button" onClick={() => setQ("")} style={{ ...S.ghost, height: 36, fontSize: 13 }}>Borrar</button>}
    </div>
  );
}

// Teclado de PIN de 3 dígitos (estilo iPhone)
export function PinPad({ pin, setPin, onOk, okLabel, okColor = C.orange, ready }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpiar", "0", "Borrar"];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "2px 0" }}>
        {[0, 1, 2].map((i) => <div key={i} style={i < pin.length ? { width: 18, height: 18, borderRadius: "50%", background: C.ink } : { width: 18, height: 18, borderRadius: "50%", border: `2px solid ${C.line3}`, boxSizing: "border-box" }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 84px)", gap: 12 }}>
        {keys.map((k) => {
          const alt = k === "Limpiar" || k === "Borrar";
          return (
            <button key={k} type="button"
              onClick={() => (k === "Limpiar" ? setPin("") : k === "Borrar" ? setPin(pin.slice(0, -1)) : pin.length < 3 && setPin(pin + k))}
              style={{ height: 62, borderRadius: 14, border: alt ? "none" : `1px solid ${C.line}`, background: alt ? "transparent" : C.soft, fontSize: alt ? 14 : 24, fontWeight: 600, color: alt ? C.faint : C.ink }}>{k}</button>
          );
        })}
      </div>
      <button type="button" onClick={onOk} style={{ ...S.btn(ready ? okColor : C.gris), width: 276, height: 56, fontSize: 17 }}>{okLabel}</button>
    </div>
  );
}
