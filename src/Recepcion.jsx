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
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {msg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: msg.ok ? C.greenSoft : C.redSoft, color: msg.ok ? C.greenDark : C.redDark }}>{msg.t}</div>}
            <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 8, background: hintColor[0], color: hintColor[1] }}>{hint}</div>
            <button type="submit" disabled={!ok || busy} style={{ ...S.btn(!ok ? "#A8A29E" : tipo === "venta" ? C.blue : C.orange), height: 52, fontSize: 17 }}>
              {busy ? "Guardando..." : tipo === "venta" ? (ventaLibre ? "Atender ahora" : "Crear turno (queda en espera)") : "Crear turno"}
            </button>
          </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Bitácora de hoy</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{hoy.length} cerrados</div>
                </div>
                {hoy.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 14, color: C.muted }}>Todavía no hay turnos terminados ni anulados.</div>}
                {hoy.map((t) => {
                  const an = t.status === "anulado";
                  return (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.soft2}`, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}><span style={{ fontFamily: mono, color: t.tipo === "venta" ? C.blue : C.orange }}>{t.numero}</span> {t.cliente_nombre} · {t.tipo === "venta" ? "Venta · " + t.busca : t.modelo_codigo}</div>
                        <div style={{ fontSize: 13, color: C.muted }}>
                          {an ? "Anulado por " + titulo(t.anulado_por_nombre) : [t.piezas, titulo(t.atendido_por_nombre), t.segundos_servicio != null ? fmtMMSS(t.segundos_servicio * 1000) : null].filter(Boolean).join(" · ")}
                          {" · Registró " + titulo(t.registrado_por_nombre) + " · " + fmtHora(t.terminado_at)}
                        </div>
                      </div>
                      <span style={S.pill(an ? C.redSoft : C.greenSoft, an ? C.redDark : C.greenDark)}>{an ? "Anulado" : t.resultado}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
