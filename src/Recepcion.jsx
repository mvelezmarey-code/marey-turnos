import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtMMSS, fmtHora, soloDigitos, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, RESULTADOS_VENTA } from "./lib.js";
import { Header, Leaderboard, Expediente, BuscadorExpediente } from "./components.jsx";

const vacio = { nombre: "", telefono: "", pueblo: "", modelo: "", serial: "", busca: "", tipoCliente: "", nota: "" };

export default function Recepcion() {
  const { empleados, modelos } = useCatalogos();
  const { abiertos, hoy, recargar } = useTurnos();
  const lbReg = useLeaderboard("leaderboard_registros_hoy");
  const now = useNow();

  const registradores = useMemo(() => empleados.filter((e) => e.orden_registro != null).sort((a, b) => a.orden_registro - b.orden_registro), [empleados]);
  const [regId, setRegId] = useState(null);
  useEffect(() => { if (!regId && registradores[0]) setRegId(registradores[0].id); }, [registradores, regId]); // siempre arranca en Anthony

  const [tipo, setTipo] = useState("ventanilla");
  const [f, setF] = useState(vacio);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [cliente, setCliente] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [anularId, setAnularId] = useState(null);

  // Cliente conocido por teléfono: llena nombre y pueblo
  const tel = soloDigitos(f.telefono);
  useEffect(() => {
    if (tel.length !== 10) { setCliente(null); return; }
    supabase.from("clientes").select("*").eq("telefono", tel).maybeSingle().then(({ data }) => {
      setCliente(data || null);
      if (data) setF((p) => ({ ...p, nombre: p.nombre || data.nombre, pueblo: p.pueblo || data.pueblo }));
    });
  }, [tel]);

  const ventanilla = abiertos.filter((t) => t.tipo === "ventanilla");
  const ventas = abiertos.filter((t) => t.tipo === "venta");
  const ventaLibre = ventas.length === 0;
  const espera = ventanilla.filter((t) => t.status === "espera").length;

  const faltan = [];
  if (!f.nombre.trim()) faltan.push("nombre");
  if (tel.length !== 10) faltan.push("teléfono (10 dígitos)");
  if (!f.pueblo.trim()) faltan.push("pueblo");
  if (tipo === "ventanilla") {
    if (!f.modelo) faltan.push("modelo");
    if (f.serial.length !== 11) faltan.push("serie de 11 dígitos");
  } else {
    if (!f.busca) faltan.push("qué busca");
    if (!f.tipoCliente) faltan.push("tipo de cliente");
  }
  const ok = faltan.length === 0 && regId;

  const crear = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg(null);
    try {
      const t = await rpc("crear_turno", {
        p_tipo: tipo, p_registrado_por: regId, p_nombre: f.nombre, p_telefono: tel, p_pueblo: f.pueblo,
        p_modelo: tipo === "ventanilla" ? f.modelo : null, p_serial: tipo === "ventanilla" ? f.serial : null,
        p_busca: tipo === "venta" ? f.busca : null, p_tipo_cliente: tipo === "venta" ? f.tipoCliente : null,
        p_nota: tipo === "venta" ? f.nota : null, p_atender_ahora: tipo === "venta" && ventaLibre,
      });
      setMsg({ ok: true, t: `Turno ${t.numero} creado para ${f.nombre.trim()}.` });
      setF(vacio); setCliente(null); recargar();
    } catch (e) { setMsg({ ok: false, t: e.message }); }
    setBusy(false);
  };

  const accion = async (fn, args) => {
    try { await rpc(fn, args); recargar(); } catch (e) { setMsg({ ok: false, t: e.message }); }
  };

  const hint = !ok ? `Falta: ${faltan.join(", ")}.`
    : tipo === "venta" ? (ventaLibre ? "No hay fila de venta: el cliente se atiende enseguida." : "Recepción está atendiendo otra venta: el cliente queda en espera.")
    : espera === 0 ? "No hay fila: el turno sale de primero en el iPad de reparación." : `Hay ${espera} en espera: el turno entra en la lista de espera.`;
  const hintColor = !ok ? [C.redSoft, C.redDark] : tipo === "venta" && !ventaLibre ? [C.orangeSoft, C.orangeDark] : [C.greenSoft, C.greenDark];

  const tab = (on, color) => ({ height: 50, borderRadius: 10, fontSize: 16, border: `2px solid ${on ? color : C.line2}`, background: on ? color : "#fff", color: on ? "#fff" : C.ink2, fontWeight: on ? 700 : 600 });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header subtitulo="Computadora de recepción" />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "440px 1fr", gap: 20, padding: "20px 24px", minHeight: 0 }}>
        {/* ---------- Formulario ---------- */}
        <form onSubmit={(e) => { e.preventDefault(); crear(); }} style={{ ...S.card, padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Nuevo turno</div>
          <div style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>¿Quién registra?</div>
            <select value={regId || ""} onChange={(e) => setRegId(Number(e.target.value))} aria-label="Quién registra" style={{ ...S.input, height: 48, fontWeight: 600 }}>
              {registradores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button type="button" onClick={() => setTipo("ventanilla")} style={tab(tipo === "ventanilla", C.orange)}>Ventanilla</button>
            <button type="button" onClick={() => setTipo("venta")} style={tab(tipo === "venta", C.blue)}>Venta</button>
          </div>
          {cliente && <div style={{ padding: "10px 12px", borderRadius: 10, background: C.greenSoft, color: C.greenDark, fontSize: 13, fontWeight: 600 }}>Cliente conocido: {cliente.nombre} · {cliente.pueblo}. Búscalo arriba a la derecha para ver su expediente.</div>}
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Información del cliente</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={S.label}>Teléfono *<input type="tel" value={f.telefono} onChange={set("telefono")} placeholder="787-000-0000" style={S.input} /></label>
            <label style={S.label}>Pueblo *<input value={f.pueblo} onChange={set("pueblo")} style={S.input} /></label>
          </div>
          <label style={S.label}>Nombre *<input value={f.nombre} onChange={set("nombre")} style={S.input} /></label>

          {tipo === "ventanilla" ? (
            <>
              <label style={S.label}>Modelo del calentador *
                <select value={f.modelo} onChange={set("modelo")} style={{ ...S.input, height: 48, fontFamily: mono }}>
                  <option value="">Escoge el modelo</option>
                  {modelos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                </select>
              </label>
              <label style={S.label}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Número de serie * (11 dígitos)</span><span style={{ color: f.serial.length === 11 ? C.green : C.red, fontWeight: 700 }}>{f.serial.length} / 11</span></div>
                <input inputMode="numeric" maxLength={11} value={f.serial} onChange={(e) => setF({ ...f, serial: soloDigitos(e.target.value).slice(0, 11) })}
                  style={{ ...S.input, height: 50, fontSize: 21, letterSpacing: 3, fontFamily: mono, border: `2px solid ${f.serial.length === 11 ? C.green : C.line2}` }} />
              </label>
            </>
          ) : (
            <>
              <div style={S.label}>Qué busca *
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {["Calentador", "Piezas /
