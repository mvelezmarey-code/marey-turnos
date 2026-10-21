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
      <button type="button" onClick={onAdd} style={{ ...S.btn(valor.trim().length >= 3 ? color :
