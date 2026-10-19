import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { C, S, mono, fmtMMSS, fmtHora, soloDigitos, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, RESULTADOS_VENTA, LUGARES_COMPRA } from "./lib.js";
import { Header, Leaderboard, Expediente, BuscadorExpediente } from "./components.jsx";
import { catalogoLlamadas, llamadasPorTelefono, llamadasDesde, registrarLlamada, estadoLlamada, esCitado, RESULTADOS_LLAMADA, MORADO } from "./llamadas.js";

const vacio = { nombre: "", telefono: "", pueblo: "", modelo: "", serial: "", compra: "", busca: "", tipoCliente: "", nota: "" };
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

  // Pueblo: un solo dropdown (lista de MareyApp) para Ventanilla, Venta y Llamada
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

  // Cliente conocido por teléfono: llena nombre y pueblo
  const tel = soloDigitos(f.telefono);
  // Historial de llamadas de ese teléfono (MareyApp)
  useEffect(() => {
    if (tel.length !== 10) { setHist([]); return; }
    llamadasPorTelefono(tel).then((d) => {
      const h = d || [];
      setHist(h);
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
    if (!f.compra) faltan.push("dónde lo compró");
  } else {
    if (!f.busca) faltan.push("qué busca");
    if (!f.tipoCliente) faltan.push("tipo de cliente");
  }
  const ok = faltan.length === 0 && regId;
  const regNombre = (registradores.find((r) => r.id === regId) || {}).nombre || "";
  const faltanL = [];
  if (!f.nombre.trim()) faltanL.push("nombre");
  if (tel.length !== 10) faltanL.push("teléfono (10 dígitos)");
  if (!fl.municipio_id) faltanL.push("pueblo");
  if (!fl.modelo_id) faltanL.push("modelo");
  const okL = faltanL.length === 0 && !!regNombre;
  const sinUsuarioLl = regNombre && cat.usuarios.length > 0 && !cat.usuarios.some((u) => u.nombre.toLowerCase() === regNombre.toLowerCase());

  const guardarLlamada = async (r) => {
    if (!okL || busy) return;
    setBusy(true); setLlMsg(null);
    try {
      await registrarLlamada({ p_registra: regNombre, p_nombre: f.nombre, p_telefono: tel, p_municipio_id: Number(fl.municipio_id), p_modelo_id: Number(fl.modelo_id),
        p_antiguedad_id: fl.antiguedad_id ? Number(fl.antiguedad_id) : null, p_problema: fl.problema, p_status: r.status, p_centro: r.centro });
      setLlMsg({ ok: true, t: `Llamada de ${f.nombre.trim()} guardada en MareyApp · ${r.label}.` });
      setF(vacio); setFl(vacioL); setHist([]); setBit("llamadas"); cargarLista();
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
        p_tipo: tipo, p_registrado_por: regId, p_nombre: f.nombre, p_telefono: tel, p_pueblo: f.pueblo,
        p_modelo: tipo === "ventanilla" ? f.modelo : null, p_serial: tipo === "ventanilla" ? f.serial : null,
        p_busca: tipo === "venta" ? f.busca : null, p_tipo_cliente: tipo === "venta" ? f.tipoCliente : null,
        p_nota: tipo === "venta" ? f.nota : notaLlamada(), p_atender_ahora: tipo === "venta" && ventaLibre,
        p_lugar_compra: tipo === "ventanilla" ? f.compra : null,
      });
      setMsg({ ok: true, t: `Turno ${t.numero} creado para ${f.nombre.trim()}.` + (tipo === "ventanilla" && citado ? " Llegó a tienda (citado por teléfono)." : "") });
      setF(vacio); setFl(vacioL); setHist([]); setCliente(null); recargar();
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
        <form onSubmit={(e) => { e.preventDefault(); if (tipo !== "llamada") crear(); }} style={{ ...S.card, padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Nuevo turno</div>
          <div style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>¿Quién registra?</div>
            <select value={regId || ""} onChange={(e) => setRegId(Number(e.target.value))} aria-label="Quién registra" style={{ ...S.input, height: 48, fontWeight: 600 }}>
              {registradores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button type="button" onClick={() => setTipo("ventanilla")} style={tab(tipo === "ventanilla", C.orange)}>Ventanilla</button>
            <button type="button" onClick={() => setTipo("venta")} style={tab(tipo === "venta", C.blue)}>Venta</button>
            <button type="button" onClick={() => setTipo("llamada")} style={tab(tipo === "llamada", MORADO)}>Llamada</button>
          </div>
          {hist.length > 0 && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#EEEDFE", border: "1px solid #CECBF6", color: "#3C3489", fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Este cliente llamó {hist.length} {hist.length === 1 ? "vez" : "veces"}</div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Historial de llamadas</div>
              </div>
              {hist.slice(0, 3).map((l) => {
                const e = estadoLlamada(l);
                return (
                  <div key={l.id} style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontWeight: 700 }}>{fechaCorta(l.created_at)}</span><span style={{ flex: "none", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: e.b, color: e.c }}>{e.t}</span></div>
                    <div style={{ color: C.ink }}>{[l.modelo, l.antiguedad, l.municipio].filter(Boolean).join(" · ")}</div>
                    <div style={{ color: C.muted }}>Problema: {l.problema || "—"} · Atendió: {l.registrado_por || "—"}</div>
                  </div>
                );
              })}
              {hist.length > 3 && <div style={{ fontWeight: 600 }}>y {hist.length - 3} más (búscalo en el expediente)</div>}
              {citado && tipo === "ventanilla" && <div style={{ fontWeight: 600 }}>Al crear el turno queda marcado como "Llegó a tienda" y el técnico ve lo que dijo por teléfono.</div>}
            </div>
          )}
          {cliente && <div style={{ padding: "10px 12px", borderRadius: 10, background: C.greenSoft, color: C.greenDark, fontSize: 13, fontWeight: 600 }}>Cliente conocido: {cliente.nombre} · {cliente.pueblo}. Búscalo arriba a la derecha para ver su expediente.</div>}
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Información del cliente</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={S.label}>Teléfono *<input type="tel" value={f.telefono} onChange={set("telefono")} placeholder="787-000-0000" style={S.input} /></label>
            <label style={S.label}>Pueblo *
              <select value={fl.municipio_id} onChange={(e) => escogerPueblo(e.target.value)} style={{ ...S.input, height: 44 }}>
                <option value="">Escoge</option>
                {cat.municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          </div>
          <label style={S.label}>Nombre *<input value={f.nombre} onChange={set("nombre")} style={S.input} /></label>

          {tipo === "llamada" ? (
            <>
              <label style={S.label}>Modelo *
                <select value={fl.modelo_id} onChange={(e) => setFl({ ...fl, modelo_id: e.target.value })} style={{ ...S.input, height: 48 }}>
                  <option value="">Escoge el modelo</option>
                  {cat.modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </label>
              <label style={S.label}>¿Hace cuánto tiene la unidad?
                <select value={fl.antiguedad_id} onChange={(e) => setFl({ ...fl, antiguedad_id: e.target.value })} style={{ ...S.input, height: 44 }}>
                  <option value="">-- Seleccionar --</option>
                  {cat.antiguedad.map((a) => <option key={a.id} value={a.id}>{a.rango}</option>)}
                </select>
              </label>
              <label style={S.label}>Problema<input value={fl.problema} onChange={(e) => setFl({ ...fl, problema: e.target.value })} placeholder="Breve descripción" style={S.input} /></label>
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {llMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: llMsg.ok ? "#E1F5EE" : C.redSoft, color: llMsg.ok ? "#0F6E56" : C.redDark }}>{llMsg.t}</div>}
                {sinUsuarioLl && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: C.orangeSoft, color: C.orangeDark }}>{regNombre} no tiene usuario en MareyApp. Escoge otra persona en "¿Quién registra?".</div>}
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink2 }}>¿Qué pasó con la llamada?</div>
                <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: okL ? C.soft2 : C.redSoft, color: okL ? C.ink2 : C.redDark }}>{okL ? "Escoge qué pasó para guardar la llamada." : `Falta: ${faltanL.join(", ")}.`}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {RESULTADOS_LLAMADA.map((r) => (
                    <button key={r.label} type="button" onClick={() => guardarLlamada(r)} disabled={!okL || busy}
                      style={{ minHeight: 48, padding: "6px 8px", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 700, color: "#fff", background: okL ? r.color : "#D6D3D1" }}>{r.label}</button>
                  ))}
                </div>
              </div>
            </>
          ) : tipo === "ventanilla" ? (
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
              <div style={S.label}>¿Dónde lo compró? *
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {LUGARES_COMPRA.map((o) => <button key={o} type="button" onClick={() => setF({ ...f, compra: o })} style={S.toggle(f.compra === o, C.orange, C.orangeSoft, C.orangeDark)}>{o}</button>)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={S.label}>Qué busca *
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {["Calentador", "Piezas / accesorios"].map((o) => <button key={o} type="button" onClick={() => setF({ ...f, busca: o })} style={S.toggle(f.busca === o, C.blue, C.blueSoft, C.blueDark)}>{o}</button>)}
                </div>
              </div>
              <div style={S.label}>Tipo de cliente *
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["Residencial", "Plomero", "Comercial"].map((o) => <button key={o} type="button" onClick={() => setF({ ...f, tipoCliente: o })} style={S.toggle(f.tipoCliente === o, C.blue, C.blueSoft, C.blueDark)}>{o}</button>)}
                </div>
              </div>
              <label style={S.label}>Nota (opcional)<input value={f.nota} onChange={set("nota")} style={S.input} /></label>
            </>
          )}
          {tipo !== "llamada" && <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {msg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: msg.ok ? C.greenSoft : C.redSoft, color: msg.ok ? C.greenDark : C.redDark }}>{msg.t}</div>}
            <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: hintColor[0], color: hintColor[1] }}>{hint}</div>
            <button type="submit" disabled={!ok || busy} style={{ ...S.btn(!ok ? "#A8A29E" : tipo === "venta" ? C.blue : C.orange), height: 52, fontSize: 17 }}>
              {busy ? "Guardando..." : tipo === "venta" ? (ventaLibre ? "Atender ahora" : "Crear turno (queda en espera)") : "Crear turno"}
            </button>
          </div>}
        </form>

        {/* ---------- Columna derecha ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          <BuscadorExpediente q={q} setQ={setQ} />
          {q.trim().length >= 3 ? <Expediente q={q} /> : (
            <>
              <Leaderboard titulo="Leaderboard · Registros" rows={lbReg} campo="registros" unidad="reg." />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
                {/* Ventanilla */}
                <div style={{ ...S.card, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.orangeDark }}>Ventanilla · lista de espera</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{espera} espera</div>
                  </div>
                  {ventanilla.length === 0 && <div style={{ padding: "22px 16px", textAlign: "center", fontSize: 14, color: C.muted }}>No hay nadie en fila.</div>}
                  {ventanilla.map((t, i) => (
                    <div key={t.id} style={{ borderTop: `1px solid ${C.soft2}` }}>
                      <div style={{ display: "flex", gap: 10, padding: "12px 16px", alignItems: "center" }}>
                        <div style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: C.orangeSoft, color: C.orangeDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600 }}>#{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}><span style={{ fontFamily: mono, color: C.orange }}>{t.numero}</span> {t.cliente_nombre}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{t.modelo_codigo} · {t.serial}</div>
                          <div style={{ fontSize: 12, color: C.faint }}>{t.status === "espera" ? "En espera · " + fmtMMSS(now - new Date(t.created_at)) : "Arreglando · " + titulo(t.atendido_por_nombre)}</div>
                        </div>
                        {anularId !== t.id && <button type="button" onClick={() => setAnularId(t.id)} style={{ flex: "none", height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#fff", color: C.red, fontSize: 12, fontWeight: 700 }}>Anular</button>}
                      </div>
                      {anularId === t.id && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.redDark }}>¿El cliente se fue? Queda en la bitácora como anulado.</div>
                          <button type="button" onClick={() => { setAnularId(null); accion("anular_turno", { p_turno: t.id, p_empleado: regId, p_motivo: "Cliente se fue" }); }} style={{ ...S.btn(C.red), height: 36, fontSize: 13 }}>Anular</button>
                          <button type="button" onClick={() => setAnularId(null)} style={{ ...S.ghost, height: 36, fontSize: 13 }}>Cancelar</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Venta */}
                <div style={{ ...S.card, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.blueDark }}>Venta</div>
                    <div style={{ fontSize: 12, color: C.muted }}>La atiende recepción</div>
                  </div>
                  {ventas.length === 0 && <div style={{ padding: "22px 16px", textAlign: "center", fontSize: 14, color: C.muted }}>Sin fila de venta.</div>}
                  {ventas.map((t) => {
                    const proc = t.status === "en_proceso";
                    return (
                      <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.soft2}`, background: proc ? "#EFF6FF" : "transparent" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 600 }}><span style={{ fontFamily: mono, color: C.blue }}>{t.numero}</span> {t.cliente_nombre}</div>
                            <div style={{ fontSize: 12, color: C.muted }}>{t.tipo_cliente} · {t.busca}</div>
                          </div>
                          <span style={S.pill(proc ? C.blueSoft : C.soft2, proc ? C.blueDark : C.ink2)}>{proc ? "Atendiendo · " + fmtMMSS(now - new Date(t.iniciado_at)) : "En espera"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {proc
                            ? RESULTADOS_VENTA.map((r) => <button key={r} type="button" onClick={() => accion("terminar_turno", { p_turno: t.id, p_empleado: regId, p_resultado: r, p_piezas: [] })} style={{ ...S.btn(C.green), flex: 1, height: 40, fontSize: 13, padding: "0 6px" }}>{r}</button>)
                            : <button type="button" onClick={() => accion("iniciar_turno", { p_turno: t.id, p_empleado: regId })} style={{ flex: 1, height: 40, borderRadius: 8, border: `2px solid ${C.blue}`, background: "#fff", color: C.blue, fontSize: 13, fontWeight: 700 }}>Atender</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Bitácora */}
              <div style={{ ...S.card, minHeight: 200 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{bit === "turnos" ? "Bitácora de hoy" : "Llamadas"}</div>
                  <div style={{ display: "flex", gap: 4, background: C.soft2, borderRadius: 8, padding: 3 }}>
                    {[["turnos", "Turnos"], ["llamadas", "Llamadas"]].map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setBit(k)} style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, background: bit === k ? "#fff" : "transparent", color: bit === k ? C.ink : C.faint }}>{l}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{bit === "turnos" ? hoy.length + " cerrados" : lista.length + (lista.length === 1 ? " llamada" : " llamadas")}</div>
                </div>
                {bit === "llamadas" && (
                  <div>
                    <div style={{ display: "flex", gap: 6, padding: "10px 16px", flexWrap: "wrap" }}>
                      {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["ano", "Año"]].map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setFiltro(k)} style={{ padding: "6px 12px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600, background: filtro === k ? MORADO : "#F0F0F0", color: filtro === k ? "#fff" : "#888" }}>{l}</button>
                      ))}
                    </div>
                    {lista.length
