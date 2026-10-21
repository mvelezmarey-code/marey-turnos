import React, { useMemo, useState } from "react";
import { C, S, mono, fmtMMSS, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, RESULTADOS_VENTANILLA, DESC_RESULTADO, SIN_PIEZA } from "./lib.js";
import { Header, Leaderboard, PinPad } from "./components.jsx";

const MIN = (seg) => (seg == null ? "—" : Math.round(seg / 60) + " min");

export default function Reparacion() {
  const { empleados, modelos, piezas, causas, cargarPiezas, cargarCausas } = useCatalogos();
  const { abiertos, hoy, recargar } = useTurnos();
  const lbRep = useLeaderboard("leaderboard_reparaciones_hoy");
  const now = useNow();
  const nm = (c) => (modelos.find((m) => m.codigo === c) || {}).nombre || c;

  const tecnicos = useMemo(() => empleados.filter((e) => (e.roles || []).includes("reparacion")), [empleados]);
  const lista = abiertos.filter((t) => t.tipo === "ventanilla");
  const enEspera = lista.filter((t) => t.status === "espera");
  const primero = enEspera[0];

  // Promedios de hoy (servicio y espera) de los turnos terminados
  const term = hoy.filter((t) => t.tipo === "ventanilla" && t.status === "terminado");
  const prom = (k) => { const v = term.map((t) => t[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  const [screen, setScreen] = useState("list"); // list | pin | work | done
  const [turnoId, setTurnoId] = useState(null);
  const [modoPin, setModoPin] = useState("iniciar"); // iniciar | continuar
  const [emp, setEmp] = useState(null);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState([]);
  const [res, setRes] = useState(null);
  const [causa, setCausa] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [pop, setPop] = useState(null); // cliente | llamada
  const [confirmAnular, setConfirmAnular] = useState(false);
  // "+ Otra pieza" / "+ Otra causa": se añaden a la lista sin repetir
  const [nuevaPieza, setNuevaPieza] = useState(null); // null = cerrado, "" = abierto
  const [nuevaCausa, setNuevaCausa] = useState(null);
  const [addMsg, setAddMsg] = useState("");

  const turno = abiertos.find((t) => t.id === turnoId) || null;
  const modelo = turno ? modelos.find((m) => m.codigo === turno.modelo_codigo) : null;
  const sinCat = modelo ? !modelo.tiene_catalogo : false;
  const opciones = turno ? piezas.filter((p) => p.modelo_codigo === turno.modelo_codigo) : [];
  const ninguna = opciones.find((p) => p.es_ninguna);
  const tieneNinguna = !!(ninguna && sel.includes(ninguna.id));
  const siguiente = enEspera.find((t) => t.id !== turnoId);

  const limpiarTrabajo = () => { setStep(1); setSel([]); setRes(null); setCausa(null); setErr(""); setPop(null); setConfirmAnular(false); setNuevaPieza(null); setNuevaCausa(null); setAddMsg(""); };
  const abrirPin = (t, modo) => { setTurnoId(t.id); setModoPin(modo); setEmp(modo === "continuar" ? tecnicos.find((x) => x.id === t.atendido_por) || null : null); setPin(""); setPinMsg(""); setScreen("pin"); };
  const volver = () => { setScreen("list"); setTurnoId(null); setEmp(null); setPin(""); limpiarTrabajo(); };

  const confirmarPin = async () => {
    if (!emp) return setPinMsg("Primero escoge tu nombre");
    if (pin.length !== 3) return setPinMsg("Faltan dígitos: pon los 3 números");
    try {
      const rows = await rpc("verificar_pin", { p_pin: pin, p_rol: "reparacion" });
      if (!rows || !rows.find((r) => r.id === emp.id)) { setPin(""); return setPinMsg("PIN incorrecto"); }
      if (modoPin === "iniciar") await rpc("iniciar_turno", { p_turno: turnoId, p_empleado: emp.id });
      limpiarTrabajo(); setScreen("work"); recargar();
    } catch (e) { setPinMsg(e.message); }
  };

  // ---------- Reglas de pieza y resultado (iguales a la base de datos) ----------
  const validRes = (r) => sinCat || (sel.length > 0 && !(r === "Reparado" && tieneNinguna) && !(r === SIN_PIEZA && !tieneNinguna));
  const toggle = (p) => {
    let next;
    if (p.es_ninguna) next = sel.includes(p.id) ? [] : [p.id];
    else next = sel.includes(p.id) ? sel.filter((x) => x !== p.id) : sel.filter((x) => x !== (ninguna && ninguna.id)).concat(p.id);
    const nN = !!(ninguna && next.includes(ninguna.id));
    const keep = res && next.length && !(res === "Reparado" && nN) && !(res === SIN_PIEZA && !nN);
    setSel(next); setRes(keep ? res : null);
  };

  const agregarPieza = async () => {
    try {
      const rows = await rpc("agregar_pieza", { p_modelo: turno.modelo_codigo, p_nombre: nuevaPieza, p_empleado: emp.id });
      const p = rows && rows[0];
      if (!p) return;
      await cargarPiezas();
      setSel((s) => (s.includes(p.id) ? s : s.filter((x) => !(ninguna && x === ninguna.id)).concat(p.id)));
      setRes((r) => (r === SIN_PIEZA ? null : r));
      setAddMsg(p.nueva ? `"${p.nombre}" se añadió a las piezas de ${nm(turno.modelo_codigo)}.` : `"${p.nombre}" ya estaba en la lista; la marqué.`);
      setNuevaPieza(null);
    } catch (e) { setAddMsg(e.message); }
  };
  const agregarCausa = async () => {
    try {
      const rows = await rpc("agregar_causa", { p_nombre: nuevaCausa, p_empleado: emp.id });
      const c = rows && rows[0];
      if (!c) return;
      await cargarCausas();
      setCausa(c.nombre);
      setAddMsg(c.nueva ? `"${c.nombre}" se añadió a las causas.` : `"${c.nombre}" ya estaba en la lista; la escogí.`);
      setNuevaCausa(null);
    } catch (e) { setAddMsg(e.message); }
  };

  const nombresSel = opciones.filter((p) => sel.includes(p.id)).map((p) => p.nombre).join(", ");
  const pasos = [
    { label: "Pieza dañada", val: sinCat ? "No lleva piezas" : sel.length ? nombresSel : "Falta", ok: sinCat || sel.length > 0 },
    { label: "Resultado", val: res || "Falta", ok: !!res },
    { label: "Causa", val: causa || "Falta", ok: !!causa },
  ];
  const listo = pasos.every((p) => p.ok);
  const faltan = pasos.filter((p) => !p.ok).map((p) => p.label.toLowerCase());

  const terminar = async () => {
    if (!listo) return;
    try {
      await rpc("terminar_turno", { p_turno: turnoId, p_empleado: emp.id, p_resultado: res, p_piezas: sinCat ? [] : sel, p_causa: causa });
      setDone({ numero: turno.numero, txt: [turno.cliente_nombre, nm(turno.modelo_codigo), nombresSel, res, "Causa: " + causa, fmtMMSS(now - new Date(turno.iniciado_at)) + " en servicio", titulo(emp.nombre)].filter(Boolean).join(" · ") });
      setScreen("done"); recargar();
    } catch (e) { setErr(e.message); }
  };
  const devolver = async () => { try { await rpc("devolver_turno", { p_turno: turnoId, p_empleado: emp.id }); recargar(); volver(); } catch (e) { setErr(e.message); } };
  const anular = async () => { try { await rpc("anular_turno", { p_turno: turnoId, p_empleado: emp.id, p_motivo: "Cliente se fue" }); recargar(); volver(); } catch (e) { setErr(e.message); } };

  const chipTop = (on, c, bg) => ({ height: 40, padding: "0 16px", borderRadius: 20, fontSize: 14, fontWeight: 700, border: `1px solid ${on ? c : C.line2}`, background: on ? c : bg, color: on ? "#fff" : c, flex: "none" });
  // Título del paso + botón "Siguiente" al lado (gris hasta que se escoge algo, verde cuando está listo)
  const pasoTitulo = (n, t, sub) => {
    const okPaso = n < 3 && pasos[n - 1].ok;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flex: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ ...S.cap, color: C.orange, letterSpacing: 0.8 }}>Paso {n} de 3</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>{t}</div>
          <div style={{ fontSize: 15, color: C.faint }}>{sub}</div>
        </div>
        {n < 3 && (
          <button type="button" disabled={!okPaso} onClick={() => { setStep(n + 1); setAddMsg(""); }}
            style={{ ...S.btn(okPaso ? C.green : C.gris), flex: "none", height: 52, padding: "0 18px 0 24px", fontSize: 17, display: "flex", alignItems: "center", gap: 6 }}>
            Siguiente
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}
      </div>
    );
  };
  const inputNuevo = (valor, setValor, onAdd, ph, color) => (
    <div style={{ display: "flex", gap: 8 }}>
      <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()} placeholder={ph} style={{ ...S.input, flex: 1 }} />
      <button type="button" onClick={onAdd} style={{ ...S.btn(valor.trim().length >= 3 ? color : C.gris), height: 46 }}>Añadir</button>
      <button type="button" onClick={() => setValor(null)} style={{ ...S.ghost, height: 46 }}>Cancelar</button>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      <Header subtitulo="iPad de reparación" />

      {/* ---------- Lista de espera ---------- */}
      {screen === "list" && (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, padding: "24px 28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flex: "none" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1 }}>Clientes en espera</span>
                <span style={{ fontFamily: mono, fontSize: 40, fontWeight: 600, color: C.orange, lineHeight: 1.1 }}>{enEspera.length}</span>
              </div>
              <span style={{ height: 34, padding: "0 14px", borderRadius: 17, background: "#fff", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <span style={S.dot(C.orange)} />{lista.length - enEspera.length} arreglando
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 4 }}>
              {lista.length === 0 && (
                <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 280, boxShadow: "none", borderStyle: "dashed" }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: C.ink2 }}>No hay clientes en espera</div>
                  <div style={{ fontSize: 15, color: C.faint }}>Cuando recepción cree un turno, aparece aquí.</div>
                </div>
              )}
              {lista.map((t, i) => {
                const proc = t.status === "en_proceso";
                const next = primero && t.id === primero.id;
                return (
                  <div key={t.id} style={{ ...S.card, flex: "none", padding: "16px 18px", display: "flex", alignItems: "center", gap: 16, ...(next ? { border: `2px solid ${C.orange}`, boxShadow: "0 14px 32px -18px rgba(180,83,9,0.45)" } : {}) }}>
                    <div style={{ width: 48, height: 48, flex: "none", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600, fontSize: 16, background: proc ? C.soft2 : C.orangeSoft, color: proc ? C.faint : C.orangeDark }}>#{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                        <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 600, color: C.orange, flex: "none" }}>{t.numero}</span>
                        <span style={{ fontSize: 19, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.cliente_nombre}</span>
                        {t.nota && <span style={{ ...S.pill(C.moradoSoft, C.morado), fontWeight: 700 }}>Llamó antes</span>}
                      </div>
                      <div style={{ fontSize: 14, color: C.faint }}>{nm(t.modelo_codigo)} · Serie {t.serial}{t.lugar_compra ? " · " + t.lugar_compra : ""}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginRight: 6, flex: "none" }}>
                      <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 600, color: proc ? C.orangeDark : C.ink }}>{fmtMMSS(now - new Date(proc ? t.iniciado_at : t.created_at))}</div>
                      <div style={{ fontSize: 12, color: C.faint }}>{proc ? titulo(t.atendido_por_nombre) + " arreglando" : "en espera"}</div>
                    </div>
                    {proc
                      ? <button type="button" onClick={() => abrirPin(t, "continuar")} style={{ ...S.ghost, height: 52, width: 130, flex: "none", fontSize: 16 }}>Continuar</button>
                      : <button type="button" onClick={() => abrirPin(t, "iniciar")} style={next ? { ...S.btn(C.orange), width: 130, flex: "none" } : { ...S.ghost, height: 52, width: 130, flex: "none", fontSize: 16, fontWeight: 700, color: C.orangeDark, borderColor: "#E7CBA9" }}>Arreglar</button>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
            <Leaderboard titulo="Reparaciones de hoy" rows={lbRep} campo="terminados" unidad="terminados" max={6} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {[["Promedio", MIN(prom("segundos_servicio")), "por reparación", C.ink], ["Espera", MIN(prom("segundos_espera")), "promedio de hoy", C.orangeDark]].map(([l, v, s, c]) => (
                <div key={l} style={{ ...S.card, borderRadius: 14, boxShadow: "none", padding: "14px 16px" }}>
                  <div style={S.cap}>{l}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: c }}>{v}</div>
                  <div style={{ fontSize: 12, color: C.faint }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------- ¿Quién eres? + PIN ---------- */}
      {screen === "pin" && turno && (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", gap: 20, padding: "24px 28px" }}>
          <div style={{ ...S.card, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 22, minHeight: 0, overflowY: "auto" }}>
            <button type="button" onClick={volver} style={{ ...S.ghost, alignSelf: "flex-start", height: 38, borderRadius: 19, display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>Clientes en espera
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ ...S.cap, color: C.orange }}>{modoPin === "iniciar" ? "Vas a arreglar" : "Vas a continuar"}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, color: C.orange }}>{turno.numero}</span><span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.4 }}>{turno.cliente_nombre}</span></div>
              <div style={{ fontSize: 16, color: C.faint }}>{nm(turno.modelo_codigo)} · Serie <span style={{ fontFamily: mono, color: C.ink }}>{turno.serial}</span>{turno.lugar_compra ? " · Compró en " + turno.lugar_compra : ""}</div>
            </div>
            <div style={{ height: 1, background: C.soft2 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>¿Quién eres?</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {tecnicos.map((e) => {
                  const off = modoPin === "continuar" && e.id !== turno.atendido_por;
                  return <button key={e.id} type="button" disabled={off} onClick={() => { setEmp(e); setPin(""); setPinMsg(""); }} style={{ ...S.opcion(emp && emp.id === e.id), height: 64, fontSize: 17, fontWeight: emp && emp.id === e.id ? 700 : 600, opacity: off ? 0.35 : 1 }}>{e.nombre}</button>;
                })}
              </div>
            </div>
          </div>
          <div style={{ ...S.card, padding: "26px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{emp ? "Hola, " + emp.nombre : "Escoge tu nombre"}</div>
              <div style={{ fontSize: 14, color: C.faint, marginTop: 4 }}>{emp ? "Los mismos 3 dígitos que usas para ponchar" : "Toca tu nombre a la izquierda"}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.red, minHeight: 18 }}>{pinMsg}</div>
            <PinPad pin={pin} setPin={(v) => { setPin(v); setPinMsg(""); }} onOk={confirmarPin} ready={emp && pin.length === 3} okLabel={modoPin === "iniciar" ? "Empezar a arreglar" : "Continuar"} />
          </div>
        </div>
      )}

      {/* ---------- Trabajando el turno: 3 pasos ---------- */}
      {screen === "work" && turno && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16, padding: "20px 28px" }}>
          <div style={{ ...S.card, flex: "none", padding: "16px 22px", display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
                <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 600, color: C.orange, flex: "none" }}>{turno.numero}</span>
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{turno.cliente_nombre}</span>
              </div>
              <div style={{ fontSize: 15, color: C.faint }}>{nm(turno.modelo_codigo)} · Serie <span style={{ fontFamily: mono, color: C.ink }}>{turno.serial}</span>{turno.lugar_compra ? " · Compró en " + turno.lugar_compra : ""}</div>
            </div>
            {turno.nota && <button type="button" onClick={() => setPop(pop === "llamada" ? null : "llamada")} style={chipTop(pop === "llamada", C.morado, C.moradoSoft)}>Llamó antes</button>}
            <button type="button" onClick={() => setPop(pop === "cliente" ? null : "cliente")} style={chipTop(pop === "cliente", C.ink2, "#fff")}>Datos del cliente</button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingLeft: 20, marginLeft: 4, borderLeft: `1px solid ${C.line}`, flex: "none" }}>
              <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 600, lineHeight: 1, letterSpacing: -0.5 }}>{fmtMMSS(now - new Date(turno.iniciado_at))}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 5 }}>{emp && emp.nombre} · en servicio</div>
            </div>
            {pop === "cliente" && (
              <div style={{ position: "absolute", top: 74, right: 150, zIndex: 5, width: 300, ...S.card, boxShadow: "0 20px 40px -16px rgba(28,25,23,0.3)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
                {[["Teléfono", turno.cliente_telefono], ["Pueblo", turno.pueblo], ["Compró en", turno.lugar_compra || "—"], ["Registró", titulo(turno.registrado_por_nombre)]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: C.faint }}>{l}</span><b>{v}</b></div>
                ))}
              </div>
            )}
            {pop === "llamada" && (
              <div style={{ position: "absolute", top: 74, right: 290, zIndex: 5, width: 380, ...S.card, border: "1px solid #DCD9FB", boxShadow: "0 20px 40px -16px rgba(83,74,183,0.35)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: C.moradoDark }}>
                <div style={{ ...S.cap, color: C.morado }}>Llamada previa</div>
                <div>{turno.nota}</div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16 }}>
            <div style={{ ...S.card, display: "flex", flexDirection: "column", minHeight: 0, padding: 14 }}>
              <div style={{ ...S.segWrap, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", flex: "none" }}>
                {pasos.map((p, i) => {
                  const on = step === i + 1;
                  return (
                    <button key={p.label} type="button" onClick={() => setStep(i + 1)} style={{ ...S.seg(on), justifyContent: "flex-start", gap: 12, padding: "10px 14px", textAlign: "left", minWidth: 0 }}>
                      <span style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, background: p.ok && !on ? C.greenSoft : on ? C.orange : C.line2, color: p.ok && !on ? C.green : on ? "#fff" : C.faint }}>{p.ok && !on ? "✓" : i + 1}</span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                        <span style={S.cap}>{p.label}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", color: p.ok ? C.ink : "#A8A29E" }}>{p.val}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 10px 6px", display: "flex", flexDirection: "column", gap: 18 }}>
                {step === 1 && (
                  <>
                    {pasoTitulo(1, "¿Qué pieza estaba dañada?", sinCat ? `El ${nm(turno.modelo_codigo)} no lleva catálogo de piezas` : `Piezas del ${nm(turno.modelo_codigo)} · puedes marcar varias`)}
                    {sinCat
                      ? <div style={{ padding: "14px 16px", borderRadius: 12, background: C.orangeSoft, color: C.orangeDark, fontSize: 15, fontWeight: 600 }}>Este modelo no lleva piezas. Sigue al resultado.</div>
                      : <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                          {opciones.map((p) => <button key={p.id} type="button" onClick={() => toggle(p)} style={S.opcion(sel.includes(p.id))}>{p.nombre}</button>)}
                          {nuevaPieza === null && <button type="button" onClick={() => { setNuevaPieza(""); setAddMsg(""); }} style={{ minHeight: 62, borderRadius: 12, border: `1px dashed ${C.orangeLine}`, background: "#FFFCF7", color: C.orangeDark, fontSize: 16, fontWeight: 700 }}>+ Otra pieza</button>}
                        </div>}
                    {!sinCat && nuevaPieza !== null && inputNuevo(nuevaPieza, setNuevaPieza, agregarPieza, `Nueva pieza para ${nm(turno.modelo_codigo)}`, C.orange)}
                    {addMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: C.soft2, color: C.ink2 }}>{addMsg}</div>}
                  </>
                )}

                {step === 2 && (
                  <>
                    {pasoTitulo(2, "¿Cómo terminó?", !pasos[0].ok ? "Primero marca la pieza dañada (paso 1)" : sinCat ? "Escoge el resultado" : tieneNinguna ? 'Marcaste "Ninguna": solo salen las opciones que aplican' : `Marcaste ${nombresSel}: solo salen las opciones que aplican`)}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {RESULTADOS_VENTANILLA.filter((r) => validRes(r) || !pasos[0].ok).map((r) => {
                        const ok = validRes(r) && pasos[0].ok;
                        const on = res === r;
                        return (
                          <button key={r} type="button" onClick={() => ok && (setRes(r), setStep(causa ? 2 : 3))}
                            style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 14, textAlign: "left", ...(ok ? S.opcion(on) : { border: `1px dashed ${C.line2}`, background: C.soft, color: "#A8A29E" }) }}>
                            <span style={{ flex: "none", width: 22, height: 22, borderRadius: "50%", boxSizing: "border-box", ...(on ? { border: `7px solid ${C.orange}`, background: "#fff" } : { border: `2px solid ${C.line3}` }) }} />
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                              <span style={{ fontSize: 18, fontWeight: 700 }}>{r}</span>
                              <span style={{ fontSize: 14, color: C.faint, fontWeight: 400 }}>{DESC_RESULTADO[r]}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    {pasoTitulo(3, "¿Qué causó el problema?", "Una sola · esto es lo que medimos para mejorar")}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                      {causas.map((c) => <button key={c.id} type="button" onClick={() => setCausa(c.nombre)} style={{ ...S.opcion(causa === c.nombre, C.ink, C.ink, "#fff"), fontSize: 15 }}>{c.nombre}</button>)}
                      {nuevaCausa === null && <button type="button" onClick={() => { setNuevaCausa(""); setAddMsg(""); }} style={{ minHeight: 62, borderRadius: 12, border: "1px dashed #A8A29E", background: C.soft, color: C.ink, fontSize: 15, fontWeight: 700 }}>+ Otra causa</button>}
                    </div>
                    {nuevaCausa !== null && inputNuevo(nuevaCausa, setNuevaCausa, agregarCausa, "Nueva causa", C.ink)}
                    {addMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10, background: C.soft2, color: C.ink2 }}>{addMsg}</div>}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
              <div style={{ ...S.card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={S.cap}>Resumen</div>
                {pasos.map((p) => (
                  <div key={p.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${C.soft2}` }}>
                    <span style={{ fontSize: 14, color: C.faint, flex: "none" }}>{p.label}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, textAlign: "right", color: p.ok ? C.ink : C.red }}>{p.val}</span>
                  </div>
                ))}
                <button type="button" onClick={terminar} style={{ ...S.btn(listo ? C.green : C.gris), height: 60, fontSize: 18, marginTop: 4 }}>Terminar turno</button>
                <div style={{ fontSize: 13, color: C.faint, textAlign: "center" }}>{listo ? "Todo listo" : "Falta: " + faltan.join(", ")}</div>
                {err && <div style={{ fontSize: 13, fontWeight: 600, color: C.redDark, textAlign: "center" }}>{err}</div>}
              </div>

              {siguiente && (
                <div style={{ ...S.card, borderRadius: 14, boxShadow: "none", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.cap}>Próximo</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{siguiente.cliente_nombre}</div>
                    <div style={{ fontSize: 13, color: C.faint }}>{siguiente.numero} · {nm(siguiente.modelo_codigo)}</div>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 600, color: C.orangeDark }}>{fmtMMSS(now - new Date(siguiente.created_at))}</div>
                </div>
              )}

              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" onClick={devolver} style={{ ...S.ghost, height: 48 }}>Devolver a la lista de espera</button>
                {confirmAnular ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={anular} style={{ ...S.btn(C.red), flex: 1, height: 48, fontSize: 15 }}>Sí, anular</button>
                    <button type="button" onClick={() => setConfirmAnular(false)} style={{ ...S.ghost, height: 48 }}>No</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmAnular(true)} style={{ ...S.ghost, height: 48, borderColor: "#F3C4C4", color: C.red, fontWeight: 700 }}>Anular turno (cliente se fue)</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {(screen === "work" || screen === "pin") && !turno && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...S.card, borderRadius: 20, padding: 36, width: 480, textAlign: "center", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Este turno ya no está abierto</div>
            <div style={{ fontSize: 15, color: C.faint }}>Lo cerraron o anularon desde otro equipo.</div>
            <button type="button" onClick={volver} style={S.btn(C.ink)}>Volver a clientes en espera</button>
          </div>
        </div>
      )}

      {screen === "done" && done && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...S.card, borderRadius: 20, boxShadow: "0 24px 48px -24px rgba(28,25,23,0.25)", padding: "44px 56px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 560, textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.greenSoft, color: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.3 }}>Turno {done.numero} terminado</div>
            <div style={{ fontSize: 15, color: C.faint }}>{done.txt}</div>
            <button type="button" onClick={() => { setDone(null); volver(); }} style={{ ...S.btn(C.ink), marginTop: 10 }}>Volver a clientes en espera</button>
          </div>
        </div>
      )}
    </div>
  );
}
