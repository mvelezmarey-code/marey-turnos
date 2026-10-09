import React, { useMemo, useState } from "react";
import { C, S, mono, fmtMMSS, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, RESULTADOS_VENTANILLA, SIN_PIEZA } from "./lib.js";
import { Header, Leaderboard, PinPad } from "./components.jsx";

export default function Reparacion() {
  const { empleados, modelos, piezas } = useCatalogos();
  const { abiertos, recargar } = useTurnos();
  const lbRep = useLeaderboard("leaderboard_reparaciones_hoy");
  const now = useNow();

  const tecnicos = useMemo(() => empleados.filter((e) => (e.roles || []).includes("reparacion")), [empleados]);
  const lista = abiertos.filter((t) => t.tipo === "ventanilla");

  const [screen, setScreen] = useState("list"); // list | pin | work | done
  const [turnoId, setTurnoId] = useState(null);
  const [modoPin, setModoPin] = useState("iniciar"); // iniciar | continuar
  const [emp, setEmp] = useState(null);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [sel, setSel] = useState([]);
  const [res, setRes] = useState(null);
  const [resMsg, setResMsg] = useState("");
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [confirmAnular, setConfirmAnular] = useState(false);

  const turno = abiertos.find((t) => t.id === turnoId) || null;
  const modelo = turno ? modelos.find((m) => m.codigo === turno.modelo_codigo) : null;
  const sinCat = modelo ? !modelo.tiene_catalogo : false;
  const opciones = turno ? piezas.filter((p) => p.modelo_codigo === turno.modelo_codigo) : [];
  const ninguna = opciones.find((p) => p.es_ninguna);
  const tieneNinguna = ninguna && sel.includes(ninguna.id);
  const siguiente = lista.find((t) => t.status === "espera" && t.id !== turnoId);

  const abrirPin = (t, modo) => { setTurnoId(t.id); setModoPin(modo); setEmp(modo === "continuar" ? tecnicos.find((x) => x.id === t.atendido_por) || null : null); setPin(""); setPinMsg(""); setScreen("pin"); };
  const volver = () => { setScreen("list"); setTurnoId(null); setEmp(null); setPin(""); setSel([]); setRes(null); setResMsg(""); setErr(""); setConfirmAnular(false); };

  const confirmarPin = async () => {
    if (!emp) return setPinMsg("Primero escoge tu nombre");
    if (pin.length !== 3) return setPinMsg("Faltan dígitos: pon los 3 números");
    try {
      const rows = await rpc("verificar_pin", { p_pin: pin, p_rol: "reparacion" });
      if (!rows || !rows.find((r) => r.id === emp.id)) { setPin(""); return setPinMsg("PIN incorrecto"); }
      if (modoPin === "iniciar") await rpc("iniciar_turno", { p_turno: turnoId, p_empleado: emp.id });
      setSel([]); setRes(null); setResMsg(""); setErr(""); setScreen("work"); recargar();
    } catch (e) { setPinMsg(e.message); }
  };

  const toggle = (p) => {
    let next;
    if (p.es_ninguna) next = sel.includes(p.id) ? [] : [p.id];
    else next = sel.includes(p.id) ? sel.filter((x) => x !== p.id) : sel.filter((x) => x !== (ninguna && ninguna.id)).concat(p.id);
    const nN = ninguna && next.includes(ninguna.id);
    const keep = res && next.length && !(res === "Reparado" && nN) && !(res === SIN_PIEZA && !nN);
    setSel(next); setRes(keep ? res : null); setResMsg("");
  };

  const locked = !sinCat && sel.length === 0;
  const porque = (r) => locked ? "Primero marca la pieza dañada (o Ninguna) y después escoge el resultado."
    : r === "Reparado" && tieneNinguna ? 'Para "Reparado" tienes que marcar la pieza que cambiaste, no "Ninguna".'
    : r === SIN_PIEZA && !sinCat && !tieneNinguna ? `Para "${SIN_PIEZA}" marca "Ninguna" en pieza dañada.` : "";
  const puedeTerminar = res && !porque(res);

  const terminar = async () => {
    if (!puedeTerminar) return;
    try {
      await rpc("terminar_turno", { p_turno: turnoId, p_empleado: emp.id, p_resultado: res, p_piezas: sinCat ? [] : sel });
      const nombres = opciones.filter((p) => sel.includes(p.id)).map((p) => p.nombre).join(", ");
      setDone({ numero: turno.numero, txt: [turno.cliente_nombre, turno.modelo_codigo, nombres, res, fmtMMSS(now - new Date(turno.iniciado_at)) + " en servicio", titulo(emp.nombre)].filter(Boolean).join(" · ") });
      setScreen("done"); recargar();
    } catch (e) { setErr(e.message); }
  };
  const devolver = async () => { try { await rpc("devolver_turno", { p_turno: turnoId, p_empleado: emp.id }); recargar(); volver(); } catch (e) { setErr(e.message); } };
  const anular = async () => { try { await rpc("anular_turno", { p_turno: turnoId, p_empleado: emp.id, p_motivo: "Cliente se fue" }); recargar(); volver(); } catch (e) { setErr(e.message); } };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header subtitulo="iPad de reparación" />

      {screen === "list" && (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, padding: "20px 24px", minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Lista de espera</div>
              <div style={{ fontSize: 14, color: C.muted }}>{lista.filter((t) => t.status === "espera").length} en espera · {lista.filter((t) => t.status === "en_proceso").length} en proceso</div>
            </div>
            {lista.length === 0 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", border: `1px dashed ${C.line2}`, borderRadius: 14, minHeight: 300 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.ink2 }}>No hay turnos en espera</div>
                <div style={{ fontSize: 16, color: C.muted }}>Cuando recepción cree un turno, aparece aquí.</div>
              </div>
            )}
            {lista.map((t, i) => {
              const proc = t.status === "en_proceso";
              return (
                <div key={t.id} style={{ ...S.card, padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 52, height: 52, flex: "none", borderRadius: 10, background: C.orangeSoft, color: C.orangeDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600, fontSize: 18 }}>#{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 17, fontWeight: 600 }}><span style={{ fontFamily: mono, color: C.orange }}>{t.numero}</span> {t.cliente_nombre}</div>
                    <div style={{ fontSize: 13, color: C.muted }}>{t.modelo_codigo} · Serie {t.serial}</div>
                    <div><span style={S.pill(proc ? C.orangeSoft : C.soft2, proc ? C.orangeDark : C.ink2)}>{proc ? "Arreglando · " + titulo(t.atendido_por_nombre) : "En espera · " + fmtMMSS(now - new Date(t.created_at))}</span></div>
                  </div>
                  {proc
                    ? <button type="button" onClick={() => abrirPin(t, "continuar")} style={{ ...S.ghost, height: 48 }}>Continuar</button>
                    : <button type="button" onClick={() => abrirPin(t, "iniciar")} style={S.btn(C.orange)}>Arreglar</button>}
                </div>
              );
            })}
          </div>
          <div style={{ minHeight: 0, overflowY: "auto" }}>
            <Leaderboard titulo="Leaderboard · Reparaciones" rows={lbRep} campo="terminados" unidad="term." mostrarResto />
          </div>
        </div>
      )}

      {screen === "pin" && turno && (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, padding: "20px 24px", minHeight: 0 }}>
          <div style={{ ...S.card, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <button type="button" onClick={volver} style={{ ...S.ghost, alignSelf: "flex-start" }}>Volver a la lista de espera</button>
            <div>
              <div style={{ fontSize: 30, fontWeight: 700 }}><span style={{ fontFamily: mono, color: C.orange }}>{turno.numero}</span> {turno.cliente_nombre}</div>
              <div style={{ fontSize: 16, color: C.muted, marginTop: 6 }}>{turno.modelo_codigo} · Serie {turno.serial}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>¿Quién eres?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {tecnicos.map((e) => (
                <button key={e.id} type="button" disabled={modoPin === "continuar" && e.id !== turno.atendido_por} onClick={() => { setEmp(e); setPinMsg(""); }}
                  style={{ height: 56, borderRadius: 10, fontSize: 15, border: emp && emp.id === e.id ? `2px solid ${C.orange}` : `1px solid ${C.line2}`, background: emp && emp.id === e.id ? C.orange : "#fff", color: emp && emp.id === e.id ? "#fff" : C.ink, fontWeight: 700, opacity: modoPin === "continuar" && e.id !== turno.atendido_por ? 0.35 : 1 }}>{e.nombre}</button>
              ))}
            </div>
          </div>
          <div style={{ ...S.card, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{emp ? "Hola, " + emp.nombre : "Escoge tu nombre"}</div>
              <div style={{ fontSize: 15, color: C.ink2, marginTop: 6 }}>{emp ? "Ingresa los mismos 3 dígitos que usas para ponchar." : "Toca tu nombre a la izquierda para empezar."}</div>
            </div>
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: C.red, minHeight: 18 }}>{pinMsg}</div>
            <PinPad pin={pin} setPin={(v) => { setPin(v); setPinMsg(""); }} onOk={confirmarPin} ready={emp && pin.length === 3} okLabel={modoPin === "iniciar" ? "Empezar a arreglar" : "Continuar"} />
          </div>
        </div>
      )}

      {screen === "work" && turno && (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, padding: "20px 24px", minHeight: 0 }}>
          <div style={{ ...S.card, borderRadius: 14, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 30, fontWeight: 700 }}><span style={{ fontFamily: mono, color: C.orange }}>{turno.numero}</span> {turno.cliente_nombre}</div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Atiende</div><div style={{ fontSize: 20, fontWeight: 700 }}>{emp && emp.nombre}</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[["Modelo", turno.modelo_codigo], ["Número de serie", turno.serial], ["Teléfono", turno.cliente_telefono], ["Pueblo", turno.pueblo]].map(([l, v]) => (
                <div key={l} style={{ background: C.soft, borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, fontFamily: l === "Número de serie" ? mono : "inherit" }}>{v}</div></div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Pieza dañada</div>
              <div style={{ fontSize: 13, color: C.muted }}>Opciones de {turno.modelo_codigo} · puedes marcar varias</div>
            </div>
            {sinCat
              ? <div style={{ padding: "12px 14px", borderRadius: 10, background: C.orangeSoft, color: C.orangeDark, fontSize: 14, fontWeight: 600 }}>Este modelo no lleva catálogo de piezas. Solo escoge el resultado.</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {opciones.map((p) => <button key={p.id} type="button" onClick={() => toggle(p)} style={S.toggle(sel.includes(p.id), C.orange, C.orangeSoft, C.orangeDark)}>{p.nombre}</button>)}
                </div>}
            <div style={{ fontSize: 15, fontWeight: 700 }}>Resultado</div>
            {(locked || resMsg) && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: C.redDark, fontSize: 14, fontWeight: 600 }}>{locked ? porque() : resMsg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {RESULTADOS_VENTANILLA.map((r) => {
                const why = porque(r);
                const on = res === r;
                return (
                  <button key={r} type="button" onClick={() => (why ? setResMsg(why) : (setRes(r), setResMsg("")))}
                    style={{ height: 56, borderRadius: 10, fontSize: 15, border: why ? `1px dashed ${C.line2}` : on ? `2px solid ${C.orange}` : `1px solid ${C.line2}`, background: why ? C.soft2 : on ? C.orange : "#fff", color: why ? "#A8A29E" : on ? "#fff" : C.ink, fontWeight: on ? 700 : 600 }}>{r}</button>
                );
              })}
            </div>
            {err && <div style={{ fontSize: 13, fontWeight: 600, color: C.redDark }}>{err}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.ink, color: "#fff", borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 14, color: C.line2, fontWeight: 600 }}>Tiempo en servicio</div>
              <div style={{ fontFamily: mono, fontSize: 60, fontWeight: 600 }}>{fmtMMSS(now - new Date(turno.iniciado_at))}</div>
            </div>
            <div style={{ ...S.card, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              <button type="button" onClick={terminar} style={{ ...S.btn(puedeTerminar ? C.green : "#A8A29E"), height: 64, fontSize: 19 }}>Terminar turno</button>
              <div style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>{puedeTerminar ? res : "Marca la pieza dañada (o Ninguna) y el resultado"}</div>
              {siguiente && (
                <div style={{ marginTop: "auto", background: C.soft, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Próximo en fila</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{siguiente.cliente_nombre}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{siguiente.numero} · {siguiente.modelo_codigo}</div>
                </div>
              )}
              {confirmAnular ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={anular} style={{ ...S.btn(C.red), flex: 1, fontSize: 14 }}>Sí, anular</button>
                  <button type="button" onClick={() => setConfirmAnular(false)} style={{ ...S.ghost, height: 48 }}>No</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmAnular(true)} style={{ height: 48, borderRadius: 10, border: "1px solid #FCA5A5", background: "#fff", color: C.red, fontSize: 15, fontWeight: 700, marginTop: siguiente ? 0 : "auto" }}>Anular turno (cliente se fue)</button>
              )}
              <button type="button" onClick={devolver} style={{ ...S.ghost, height: 52, fontSize: 16 }}>Devolver a la lista de espera</button>
            </div>
          </div>
        </div>
      )}

      {(screen === "work" || screen === "pin") && !turno && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...S.card, borderRadius: 16, padding: 32, width: 480, textAlign: "center", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Este turno ya no está abierto</div>
            <div style={{ fontSize: 15, color: C.muted }}>Lo cerraron o anularon desde otro equipo.</div>
            <button type="button" onClick={volver} style={S.btn(C.ink)}>Volver a la lista de espera</button>
          </div>
        </div>
      )}

      {screen === "done" && done && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...S.card, borderRadius: 16, padding: "40px 52px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: 560 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.greenSoft, color: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>Turno {done.numero} terminado</div>
            <div style={{ fontSize: 16, color: C.muted, textAlign: "center" }}>{done.txt}</div>
            <button type="button" onClick={() => { setDone(null); volver(); }} style={{ ...S.btn(C.ink), marginTop: 10 }}>Volver a la lista de espera</button>
          </div>
        </div>
      )}
    </div>
  );
}
