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
    : r.status === "terminado" ? [r.resultado, C.greenSoft,
