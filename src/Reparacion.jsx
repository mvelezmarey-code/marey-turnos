import React, { useMemo, useState } from "react";
import { C, S, mono, fmtMMSS, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, RESULTADOS_VENTANILLA, SIN_PIEZA } from "./lib.js";
import { Header, Leaderboard, PinPad } from "./components.jsx";

export default function Reparacion() {
  const { empleados, modelos, piezas, causas, cargarPiezas, cargarCausas } = useCatalogos();
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
  const [causa, setCausa] = useState(null);
  const [resMsg, setResMsg] = useState("");
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
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
  const tieneNinguna = ninguna && sel.includes(ninguna.id);
  const siguiente = lista.find((t) => t.status === "espera" && t.id !== turnoId);

  const abrirPin = (t, modo) => { setTurnoId(t.id); setModoPin(modo); setEmp(modo === "continuar" ? tecnicos.find((x) => x.id === t.atendido_por) || null : null); setPin(""); setPinMsg(""); setScreen("pin"); };
  const volver = () => { setScreen("list"); setTurnoId(null); setEmp(null); setPin(""); setSel([]); setRes(null); setCausa(null); setResMsg(""); setErr(""); setConfirmAnular(false); setNuevaPieza(null); setNuevaCausa(null); setAddMsg(""); };

  const agregarPieza = async () => {
    try {
      const rows = await rpc("agregar_pieza", { p_modelo: turno.modelo_codigo, p_nombre: nuevaPieza, p_empleado: emp.id });
      const p = rows && rows[0];
      if (!p) return;
      await cargarPiezas();
      setSel((s) => (s.includes(p.id) ? s : s.filter((x) => !(ninguna && x === ninguna.id)).concat(p.id)));
      setRes((r) => (r === SIN_PIEZA ? null : r));
      setAddMsg(p.nueva ? `"${p.nombre}" se añadió a las piezas de ${turno.modelo_codigo}.` : `"${p.nombre}" ya estaba en la lista; la marqué.`);
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

  const confirmarPin = async () => {
    if (!emp) return setPinMsg("Primero escoge tu nombre");
    if (pin.length !== 3) return setPinMsg("Faltan dígitos: pon los 3 números");
    try {
      const rows = await rpc("verificar_pin", { p_pin: pin, p_rol: "reparacion" });
      if (!rows || !rows.find((r) => r.id === emp.id)) { setPin(""); return setPinMsg("PIN incorrecto"); }
      if (modoPin === "iniciar") await rpc("iniciar_turno", { p_turno: turnoId, p_empleado: emp.id });
      setSel([]); setRes(null); setCausa(null); setResMsg(""); setErr(""); setNuevaPieza(null); setNuevaCausa(null); setAddMsg(""); setScreen("work"); recargar();
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
  const puedeTerminar = res && !porque(res) && causa;

  const terminar = async () => {
    if (!puedeTerminar) return;
    try {
      await rpc("terminar_turno", { p_turno: turnoId, p_empleado: emp.id, p_resultado: res, p_piezas: sinCat ? [] : sel, p_causa: causa });
      const nombres = opciones.filter((p) => sel.includes(p.id)).map((p) => p.nombre).join(", ");
      setDone({ numero: turno.numero, txt: [turno.cliente_nombre, turno.modelo_codigo, nombres, res, "Causa: " + causa, fmtMMSS(now - new
