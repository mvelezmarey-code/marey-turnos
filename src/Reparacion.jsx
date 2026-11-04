import React, { useEffect, useMemo, useState } from "react";
import { C, S, mono, titulo, useNow, useCatalogos, useTurnos, useLeaderboard, rpc, SIN_PIEZA, TZ } from "./lib.js";
import { Leaderboard, PinPad } from "./components.jsx";

const NO_QUISO = "Cliente no quiso reparar";
const minDesde = (ts, now) => (ts ? Math.max(0, Math.floor((now - new Date(ts)) / 60000)) : 0);
const MIN = (seg) => (seg == null ? "—" : Math.round(seg / 60) + " min");
const ESPERA_LARGA = 15; // minutos: el tiempo sale en rojo
const MAX_FILAS = 4;
const CIERRE_SEG = 8; // la pantalla de "terminado" se cierra sola y la sesión se acaba
const sombra = "0 18px 40px -28px rgba(28,25,23,0.28)";
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: sombra };
const flecha = (d) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

// "Elemento superior" -> "el elemento superior"; "Válvula de alivio" -> "la válvula de alivio"
const conArticulo = (n) => (/a$/i.test(n.split(" ")[0]) ? "la " : "el ") + n.charAt(0).toLowerCase() + n.slice(1);

// ---------- Gamificación: el calentador se va calentando con cada paso ----------
const AGUA = ["#93C5FD", "#FACC15", "#F97316", "#DC2626"];
const TEMA_COLOR = ["#2563EB", "#CA8A04", "#EA580C", "#DC2626"];
const TEMA = ["Fría", "Tibia", "Calentando", "¡Caliente!"];
function Calentador({ nivel, k = 1 }) {
  const n = Math.min(3, Math.max(0, nivel));
  const vapor = (x, h, rot) => <div style={{ position: "absolute", left: x * k, top: -h * k, width: 4 * k, height: h * k, borderRadius: 4, background: C.line3, opacity: 0.8, transform: `rotate(${rot}deg)` }} />;
  return (
    <div style={{ position: "relative", flex: "none", width: 30 * k, height: 46 * k }} aria-hidden="true">
      {n === 3 && <>{vapor(5, 10, -12)}{vapor(13, 13, 0)}{vapor(21, 10, 12)}</>}
      <div style={{ position: "absolute", left: 7 * k, top: 0, width: 4 * k, height: 6 * k, background: C.faint, borderRadius: 2 }} />
      <div style={{ position: "absolute", right: 7 * k, top: 0, width: 4 * k, height: 6 * k, background: C.faint, borderRadius: 2 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 5 * k, bottom: 0, border: `${2 * k}px solid ${C.ink2}`, borderRadius: `${9 * k}px ${9 * k}px ${6 * k}px ${6 * k}px`, background: "#fff", overflow: "hidden", boxSizing: "border-box" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "72%", transition: "background 0.5s", background: AGUA[n] }} />
        <div style={{ position: "absolute", left: "50%", top: 6 * k, marginLeft: -4 * k, width: 8 * k, height: 8 * k, borderRadius: "50%", background: "#fff", border: `${1.5 * k}px solid ${C.ink2}`, boxSizing: "border-box" }} />
      </div>
    </div>
  );
}

function TopBar({ soloHora }) {
  const now = useNow(15000);
  const fecha = new Date(now).toLocaleDateString("es-PR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  const hora = new Date(now).toLocaleTimeString("es-PR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px 0" }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.2, color: C.orange }}>{soloHora ? "" : "REPARACIÓN VENTANILLA"}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink2 }}>{titulo(fecha)} · <span style={{ fontFamily: mono }}>{hora}</span></div>
    </div>
  );
}

export default function Reparacion() {
  const { empleados, modelos, piezas, causas, cargarPiezas, cargarCausas } = useCatalogos();
  const { abiertos, hoy, recargar } = useTurnos();
  const lbRep = useLeaderboard("leaderboard_reparaciones_hoy");
  const now = useNow();
  const nm = (c) => (modelos.find((m) => m.codigo === c) || {}).nombre || c;

  const tecnicos = useMemo(() => empleados.filter((e) => (e.roles || []).includes("reparacion")), [empleados]);
  const lista = abiertos.filter((t) => t.tipo === "ventanilla" && (t.status === "espera" || t.status === "en_proceso"));
  const enEspera = lista.filter((t) => t.status === "espera");
  const reparando = lista.filter((t) => t.status === "en_proceso");
  const primero = enEspera[0];
  const term = hoy.filter((t) => t.tipo === "ventanilla" && t.status === "terminado");
  const terminadosHoy = term.length + abiertos.filter((t) => t.tipo === "ventanilla" && t.status === "decision").length;
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
  const [cuenta, setCuenta] = useState(CIERRE_SEG);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(null); // cliente | llamada
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [nuevaPieza, setNuevaPieza] = useState(null); // null = cerrado, "" = abierto
  const [nuevaCausa, setNuevaCausa] = useState(null);
  const [addMsg, setAddMsg] = useState("");

  const turno = abiertos.find((t) => t.id === turnoId) || null;
  const turnoPin = turno || lista.find((t) => t.id === turnoId) || null;
  const modelo = turno ? modelos.find((m) => m.codigo === turno.modelo_codigo) : null;
  const sinCat = modelo ? !modelo.tiene_catalogo : false;
  const opciones = turno ? piezas.filter((p) => p.modelo_codigo === turno.modelo_codigo) : [];
  const ninguna = opciones.find((p) => p.es_ninguna);
  const reales = opciones.filter((p) => !p.es_ninguna);
  const tieneNinguna = !!(ninguna && sel.includes(ninguna.id));
  const posFila = (t) => enEspera.findIndex((x) => x.id === t.id) + 1;
  // Cuántos lleva hoy y en qué lugar va (para la pantalla de terminado)
  const statsDone = (() => {
    if (!done) return null;
    const ord = [...lbRep].sort((a, b) => b.terminados - a.terminados);
    const i = ord.findIndex((r) => String(r.nombre).toLowerCase() === String(done.nombre).toLowerCase());
    return i >= 0 && ord[i].terminados > 0 ? { n: ord[i].terminados, pos: i + 1 } : null;
  })();

  const limpiarTrabajo = () => { setStep(1); setSel([]); setRes(null); setCausa(null); setErr(""); setPop(null); setConfirmAnular(false); setNuevaPieza(null); setNuevaCausa(null); setAddMsg(""); setBusy(false); };
  const abrirPin = (t, modo) => { setTurnoId(t.id); setModoPin(modo); setEmp(modo === "continuar" ? tecnicos.find((x) => x.id === t.atendido_por) || null : null); setPin(""); setPinMsg(""); setScreen("pin"); };
  // Cerrar sesión: vuelve a la lista y se olvida del técnico (el próximo tiene que poner su PIN)
  const volver = () => { setScreen("list"); setTurnoId(null); setEmp(null); setPin(""); setDone(null); limpiarTrabajo(); };

  // La pantalla de terminado se cierra sola
  useEffect(() => {
    if (screen !== "done") return;
    setCuenta(CIERRE_SEG);
    const iv = setInterval(() => setCuenta((c) => c - 1), 1000);
    return () => clearInterval(iv);
  }, [screen]);
  useEffect(() => { if (screen === "done" && cuenta <= 0) volver(); }, [cuenta, screen]); // eslint-disable-line

  const confirmarPin = async () => {
    if (!emp) return setPinMsg("Primero escoge tu nombre");
    if (pin.length !== 3) return setPinMsg("Faltan dígitos: pon los 3 números");
    if (busy) return;
    setBusy(true);
    try {
      const rows = await rpc("verificar_pin", { p_pin: pin, p_rol: "reparacion" });
      if (!rows || !rows.find((r) => r.id === emp.id)) { setPin(""); setBusy(false); return setPinMsg("PIN incorrecto"); }
      if (modoPin === "iniciar") await rpc("iniciar_turno", { p_turno: turnoId, p_empleado: emp.id });
      limpiarTrabajo(); setScreen("work"); recargar();
    } catch (e) { setPinMsg(e.message); setPin(""); }
    setBusy(false);
  };
  // Con el tercer dígito entra solo (no hay que tocar "Empezar a reparar")
  useEffect(() => { if (screen === "pin" && emp && pin.length === 3) confirmarPin(); }, [pin, emp]); // eslint-disable-line

  // ---------- Paso 1: piezas ----------
  const toggle = (p) => {
    let next;
    if (p.es_ninguna) next = sel.includes(p.id) ? [] : [p.id];
    else next = sel.includes(p.id) ? sel.filter((x) => x !== p.id) : sel.filter((x) => x !== (ninguna && ninguna.id)).concat(p.id);
    const nN = !!(ninguna && next.includes(ninguna.id));
    // Ninguna = orientación automática; si la quita, se borra
    setSel(next);
    setRes(nN ? SIN_PIEZA : res === SIN_PIEZA ? null : res);
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

  // ---------- Paso 2: pregunta armada con la pieza ----------
  const selReales = reales.filter((p) => sel.includes(p.id)).map((p) => p.nombre);
  const nombresSel = tieneNinguna ? "Ninguna" : selReales.join(", ");
  const frases = selReales.map(conArticulo);
  const plural = frases.length > 1;
  const femSola = frases.length === 1 && frases[0].startsWith("la ");
  const lo = plural ? "los" : femSola ? "la" : "lo";
  const piezaFrase = frases.length > 1 ? frases.slice(0, -1).join(", ") + " y " + frases[frases.length - 1] : frases[0] || "el calentador";
  const opcionesRes = sinCat
    ? [["Reparado", "Sí", "El cliente lo quiere reparar"], [NO_QUISO, "No", "El cliente no lo quiere reparar"], [SIN_PIEZA, "Le orienté", "No había nada roto: le expliqué al cliente"]]
    : [["Reparado", "Sí", `El cliente ${lo} quiere reparar`], [NO_QUISO, "No", `El cliente no ${lo} quiere reparar`]];

  const noQuiso = res === NO_QUISO;
  const orientacion = tieneNinguna || (sinCat && res === SIN_PIEZA);
  const p1ok = sinCat || sel.length > 0;
  const pasos = [
    { label: "Pieza dañada", val: sinCat ? "No lleva piezas" : sel.length ? nombresSel : "Falta", ok: p1ok },
    { label: "Resultado", val: tieneNinguna ? "Orientación (automático)" : res === "Reparado" ? "Sí, lo quiere reparar" : res === NO_QUISO ? "No quiso reparar" : res === SIN_PIEZA ? "Le orienté" : "Falta", ok: !!res },
    noQuiso ? { label: "Anthony decide", val: "Le toca a recepción", ok: true } : { label: "Causa", val: causa || "Falta", ok: !!causa },
  ];
  const listo = p1ok && !!res && (noQuiso || !!causa);
  const hechos = pasos.filter((p) => p.ok).length;

  const terminar = async () => {
    if (!listo || busy) return;
    setBusy(true); setErr("");
    try {
      await rpc("terminar_turno", { p_turno: turnoId, p_empleado: emp.id, p_resultado: res, p_piezas: sinCat ? [] : sel, p_causa: noQuiso ? null : causa });
      const mins = minDesde(turno.iniciado_at, now);
      setDone({
        numero: turno.numero, anthony: noQuiso, nombre: emp.nombre,
        txt: [turno.cliente_nombre, nm(turno.modelo_codigo), nombresSel || null, noQuiso ? "Anthony pone con qué se fue" : "Causa: " + causa, mins + " min reparando", titulo(emp.nombre)].filter(Boolean).join(" · "),
      });
      setScreen("done"); recargar();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const devolver = async () => { try { await rpc("devolver_turno", { p_turno: turnoId, p_empleado: emp.id }); recargar(); volver(); } catch (e) { setErr(e.message); } };
  const anular = async () => { try { await rpc("anular_turno", { p_turno: turnoId, p_empleado: emp.id, p_motivo: "Cliente se fue" }); recargar(); volver(); } catch (e) { setErr(e.message); } };

  // ---------- Barra de abajo: Atrás + Siguiente ----------
  const okPaso = step === 1 ? p1ok : step === 2 ? !!res : listo;
  const atras = () => { if (step === 3 && tieneNinguna) setStep(1); else if (step > 1) setStep(step - 1); setAddMsg(""); };
  const avanzar = () => {
    if (!okPaso) return;
    setAddMsg("");
    if (step === 1) setStep(tieneNinguna ? 3 : 2);
    else if (step === 2) { if (noQuiso) terminar(); else setStep(3); }
    else terminar();
  };
  const avanzarTxt = busy ? "Guardando..." : step === 2 && noQuiso ? "Enviar a Anthony" : step === 3 ? "Terminar turno" : "Siguiente";
  const pregunta = step === 1 ? (sinCat ? "Este modelo no lleva piezas · dale a Siguiente" : "¿Qué pieza estaba dañada?")
    : step === 2 ? (!p1ok ? "Primero marca la pieza dañada" : sinCat ? "¿El cliente quiere reparar el calentador?" : `¿El cliente quiere reparar ${piezaFrase}?`)
    : orientacion ? "¿Por qué vino el cliente?" : "¿Qué causó el problema?";

  const opcion = (on) => on
    ? { border: `2px solid ${C.orange}`, background: C.orangeSoft, color: C.orangeDark, fontWeight: 700, boxShadow: "0 6px 14px -10px rgba(180,83,9,0.6)" }
    : { border: `1px solid ${C.line2}`, background: "#fff", color: C.ink, fontWeight: 500 };
  const radio = (on) => ({ flex: "none", width: 28, height: 28, borderRadius: "50%", boxSizing: "border-box", ...(on ? { border: `9px solid ${C.orange}`, background: "#fff" } : { border: "2px solid #A8A29E" }) });
  const chipTop = (on, c, bg) => ({ height: 40, padding: "0 16px", borderRadius: 20, fontSize: 14, fontWeight: 700, border: `1px solid ${on ? c : C.line2}`, background: on ? c : bg, color: on ? "#fff" : c, flex: "none" });
  const inputNuevo = (valor, setValor, onAdd, ph, color) => (
    <div style={{ display: "flex", gap: 8, flex: "none" }}>
      <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()} placeholder={ph} style={{ ...S.input, height: 54, fontSize: 17, flex: 1 }} />
      <button type="button" onClick={onAdd} style={{ ...S.btn(valor.trim().length >= 3 ? color : C.gris), height: 54 }}>Añadir</button>
      <button type="button" onClick={() => setValor(null)} style={{ ...S.ghost, height: 54 }}>Cancelar</button>
    </div>
  );

  // ---------- Lista de espera (también se ve borrosa detrás del PIN) ----------
  const filas = lista.slice(0, MAX_FILAS);
  const grid = { display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 150px 140px", gap: 20, alignItems: "center" };
  const tile = (label, n, color, fuerte) => (
    <div style={{ height: 96, boxSizing: "border-box", borderRadius: 20, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      ...(fuerte ? { background: C.orange, color: "#fff", boxShadow: "0 18px 34px -20px rgba(180,83,9,0.85)" } : { background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 18px 40px -30px rgba(28,25,23,0.3)" }) }}>
      <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2, color: fuerte ? "#fff" : C.ink2, whiteSpace: "pre-line" }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 54, fontWeight: 600, lineHeight: 1, color: fuerte ? "#fff" : color }}>{n}</div>
    </div>
  );
  const listaView = (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, padding: "16px 28px 26px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {tile("Clientes\nen espera", enEspera.length, "#fff", true)}
          {tile("Reparando\nahora", reparando.length, C.orangeDark)}
          {tile("Terminados\nhoy", terminadosHoy, C.green)}
        </div>
        <div style={{ ...card, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ ...grid, flex: "none", padding: "14px 22px 10px", fontSize: 11, fontWeight: 700, color: "#A8A29E", textTransform: "uppercase", letterSpacing: 0.8 }}>
            <span style={{ textAlign: "center" }}>Fila</span><span>Cliente</span><span>Tiempo de espera</span><span />
          </div>
          {lista.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, borderTop: `1px solid ${C.soft2}` }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.ink2 }}>No hay clientes en espera</div>
              <div style={{ fontSize: 15, color: C.faint }}>Cuando recepción cree un turno, aparece aquí.</div>
            </div>
          )}
          {filas.map((t) => {
            const proc = t.status === "en_proceso";
            const next = primero && t.id === primero.id;
            const mins = minDesde(proc ? t.iniciado_at : t.created_at, now);
            const largo = !proc && mins >= ESPERA_LARGA;
            return (
              <div key={t.id} style={{ ...grid, flex: 1, minHeight: 0, maxHeight: 112, padding: "0 22px", borderTop: `1px solid ${C.soft2}`, ...(next ? { background: "linear-gradient(90deg, #FFF7EB, #FFFFFF 70%)", boxShadow: `inset 4px 0 0 ${C.orange}` } : {}) }}>
                <div style={{ height: 64, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  ...(proc ? { background: C.soft2, color: C.muted } : next ? { background: C.orange, color: "#fff", boxShadow: "0 10px 20px -12px rgba(180,83,9,0.8)" } : { background: C.soft, border: `1px solid ${C.line}`, color: C.ink2 }) }}>
                  <span style={proc ? { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 } : { fontFamily: mono, fontSize: 36, fontWeight: 600, lineHeight: 1 }}>{proc ? "Reparando" : posFila(t)}</span>
                </div>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.cliente_nombre}</span>
                    {t.nota && <span style={{ ...S.pill(C.moradoSoft, C.morado), fontWeight: 700 }}>Llamó antes</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
                    <span style={{ flex: "none", fontSize: 18, fontWeight: 700, color: C.orangeDark }}>{nm(t.modelo_codigo)}</span>
                    <span style={{ fontSize: 14, color: C.faint, overflow: "hidden", textOverflow: "ellipsis" }}>{proc ? "con " + titulo(t.atendido_por_nombre) : "Serie " + t.serial}{t.lugar_compra ? " · " + t.lugar_compra : ""}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, color: largo ? C.red : proc ? C.orangeDark : C.ink }}>{mins} min</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: next ? C.orange : "#A8A29E" }}>{proc ? "reparando" : next ? "esperando · le toca" : "esperando"}</div>
                </div>
                {proc
                  ? <button type="button" onClick={() => abrirPin(t, "continuar")} style={{ height: 56, borderRadius: 14, fontSize: 17, fontWeight: 700, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2 }}>Continuar</button>
                  : <button type="button" onClick={() => abrirPin(t, "iniciar")} style={{ height: 56, borderRadius: 14, fontSize: 17, fontWeight: 700, ...(next ? { border: "none", background: C.ink, color: "#fff", boxShadow: "0 10px 22px -12px rgba(28,25,23,0.7)" } : { border: `1px solid ${C.line2}`, background: "#fff", color: "#A8A29E" }) }}>Reparar</button>}
              </div>
            );
          })}
          <div style={{ marginTop: "auto", flex: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 22px", borderTop: `1px solid ${C.soft2}`, fontSize: 13, color: C.faint }}>
            <span>El orden lo pone recepción · repara siempre el primero</span>
            {lista.length > MAX_FILAS && <span style={{ fontWeight: 700, color: C.orangeDark }}>+ {lista.length - MAX_FILAS} más en la lista</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Leaderboard titulo="Reparaciones de hoy" rows={lbRep} campo="terminados" unidad="terminados" max={7} />
        </div>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {[["Promedio", MIN(prom("segundos_servicio")), "por reparación", C.ink], ["Tiempo de espera", MIN(prom("segundos_espera")), "promedio de hoy", C.orangeDark]].map(([l, v, s, c]) => (
            <div key={l} style={{ ...card, boxShadow: "0 18px 40px -30px rgba(28,25,23,0.3)", padding: "16px 18px" }}>
              <div style={S.cap}>{l}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: c }}>{v}</div>
              <div style={{ fontSize: 12, color: C.faint }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden", position: "relative" }}>
      {/* ---------- Lista + PIN encima (la lista se ve borrosa detrás) ---------- */}
      {(screen === "list" || screen === "pin") && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", transition: "filter 0.25s", ...(screen === "pin" ? { filter: "blur(6px)", pointerEvents: "none" } : {}) }} aria-hidden={screen === "pin"}>
          <TopBar />
          {listaView}
        </div>
      )}

      {screen === "pin" && turnoPin && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(28,25,23,0.28)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div role="dialog" aria-label="Poner PIN" style={{ width: 880, maxWidth: "100%", background: "#fff", borderRadius: 24, boxShadow: "0 40px 80px -30px rgba(28,25,23,0.55)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", overflow: "hidden" }}>
            <div style={{ padding: "28px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ ...S.cap, color: C.orange, letterSpacing: 0.8 }}>{modoPin === "iniciar" ? "Vas a reparar" : "Vas a continuar"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span style={{ flex: "none", fontSize: 15, fontWeight: 700, color: "#fff", background: C.orange, padding: "5px 12px", borderRadius: 10 }}>{modoPin === "iniciar" ? posFila(turnoPin) + "º en fila" : "Reparando"}</span>
                    <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{turnoPin.cliente_nombre}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 19, fontWeight: 700, color: C.orangeDark }}>{nm(turnoPin.modelo_codigo)}</span><span style={{ fontSize: 15, color: C.faint }}>Serie <span style={{ fontFamily: mono, color: C.ink }}>{turnoPin.serial}</span> · esperando {minDesde(turnoPin.created_at, now)} min</span></div>
                </div>
                <button type="button" onClick={volver} aria-label="Cerrar" style={{ flex: "none", width: 44, height: 44, borderRadius: 22, border: `1px solid ${C.line2}`, background: "#fff", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div style={{ height: 1, background: C.soft2 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>¿Quién eres?</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  {tecnicos.map((e) => {
                    const off = modoPin === "continuar" && e.id !== turnoPin.atendido_por;
                    const on = emp && emp.id === e.id;
                    return <button key={e.id} type="button" disabled={off} onClick={() => { setEmp(e); setPin(""); setPinMsg(""); }}
                      style={{ height: 64, borderRadius: 12, fontSize: 17, ...opcion(on), fontWeight: on ? 700 : 600, opacity: off ? 0.35 : 1 }}>{e.nombre}</button>;
                  })}
                </div>
              </div>
            </div>
            <div style={{ background: C.soft, borderLeft: `1px solid ${C.soft2}`, padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{emp ? "Hola, " + emp.nombre : "Escoge tu nombre"}</div>
                <div style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>{emp ? "Los mismos 3 dígitos que usas para ponchar · entra solo" : "Toca tu nombre a la izquierda"}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.red, minHeight: 18 }}>{pinMsg}</div>
              <PinPad pin={pin} setPin={(v) => { setPin(v); setPinMsg(""); }} onOk={confirmarPin} ready={emp && pin.length === 3} okLabel={busy ? "Entrando..." : modoPin === "iniciar" ? "Empezar a reparar" : "Continuar"} />
            </div>
          </div>
        </div>
      )}

      {/* ---------- Trabajando el turno ---------- */}
      {screen === "work" && turno && (
        <>
          <TopBar soloHora />
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16, padding: "16px 28px 24px" }}>
            <div style={{ ...card, flex: "none", padding: "16px 22px", display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ flex: "none", fontSize: 15, fontWeight: 700, color: C.orangeDark, background: C.orangeSoft, border: "1px solid #E7CBA9", padding: "4px 12px", borderRadius: 10 }}>Reparando</span>
                  <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{turno.cliente_nombre}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span style={{ flex: "none", fontSize: 22, fontWeight: 700, color: C.ink }}>{nm(turno.modelo_codigo)}</span>
                  <span style={{ fontSize: 15, color: C.faint, overflow: "hidden", textOverflow: "ellipsis" }}>Serie <span style={{ fontFamily: mono, color: C.ink }}>{turno.serial}</span>{turno.lugar_compra ? " · Compró en " + turno.lugar_compra : ""}</span>
                </div>
              </div>
              <button type="button" onClick={() => setPop(pop === "cliente" ? null : "cliente")} style={chipTop(pop === "cliente", C.ink2, "#fff")}>Info del cliente</button>
              <button type="button" onClick={devolver} style={{ flex: "none", height: 52, padding: "0 16px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", lineHeight: 1.15, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Devolver</span><span style={{ fontSize: 12, color: C.faint }}>a la lista de espera</span>
              </button>
              {confirmAnular ? (
                <>
                  <button type="button" onClick={anular} style={{ flex: "none", height: 52, padding: "0 16px", borderRadius: 14, border: "none", background: C.red, color: "#fff", fontSize: 15, fontWeight: 700 }}>Sí, anular</button>
                  <button type="button" onClick={() => setConfirmAnular(false)} style={{ flex: "none", height: 52, padding: "0 14px", borderRadius: 14, border: `1px solid ${C.line2}`, background: "#fff", color: C.ink2, fontSize: 15, fontWeight: 600 }}>No</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmAnular(true)} style={{ flex: "none", height: 52, padding: "0 16px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", lineHeight: 1.15, border: `1px solid ${C.line2}`, background: C.soft2, color: C.red }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Anular turno</span><span style={{ fontSize: 12, opacity: 0.8 }}>el cliente se fue</span>
                </button>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingLeft: 20, marginLeft: 4, borderLeft: `1px solid ${C.line}`, flex: "none" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#A8A29E", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Tiempo reparando</div>
                <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, lineHeight: 1, letterSpacing: -0.5 }}>{minDesde(turno.iniciado_at, now)} min</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, marginTop: 4 }}>{emp && emp.nombre}</div>
              </div>
              {pop === "cliente" && (
                <div style={{ position: "absolute", top: 80, right: 340, zIndex: 5, width: 340, ...card, boxShadow: "0 20px 40px -16px rgba(28,25,23,0.3)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
                  {[["Teléfono", turno.cliente_telefono], ["Pueblo", turno.pueblo], ["Compró en", turno.lugar_compra || "—"], ["Registró", titulo(turno.registrado_por_nombre)]].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: C.faint }}>{l}</span><b>{v}</b></div>
                  ))}
                  {turno.nota && <div style={{ marginTop: 4, padding: "10px 12px", borderRadius: 10, background: C.moradoSoft, color: C.moradoDark }}><div style={{ ...S.cap, color: C.morado, marginBottom: 4 }}>Llamó antes</div>{turno.nota}</div>}
                </div>
              )}
            </div>

            {/* ¿Cómo vas? arriba, en horizontal */}
            <div style={{ ...card, borderRadius: 16, flex: "none", padding: "8px 20px", display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flex: "none", width: 170, display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
                <Calentador nivel={hechos} />
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#A8A29E", textTransform: "uppercase", letterSpacing: 0.6 }}>El calentador</span>
                  <span style={{ fontSize: 16, fontWeight: 800, transition: "color 0.4s", color: TEMA_COLOR[Math.min(3, hechos)] }}>{TEMA[Math.min(3, hechos)]}</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, position: "relative", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", alignItems: "center" }}>
                <div style={{ position: "absolute", left: 16, right: 16, top: 14, height: 6, borderRadius: 3, background: C.soft2, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, transition: "width 0.4s, background 0.4s", width: [0, 33, 66, 100][Math.min(3, hechos)] + "%", background: AGUA[Math.min(3, hechos)] }} />
                </div>
                {pasos.map((p, i) => {
                  const on = step === i + 1;
                  const hecho = p.ok && !on;
                  return (
                    <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, minWidth: 0, paddingRight: 10 }}>
                      <span style={{ flex: "none", position: "relative", zIndex: 1, width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, boxSizing: "border-box",
                        ...(hecho ? { background: C.green, color: "#fff", boxShadow: "0 8px 16px -8px rgba(21,128,61,0.7)" } : on ? { background: C.orange, color: "#fff", boxShadow: `0 0 0 4px ${C.orangeSoft}, 0 8px 16px -8px rgba(180,83,9,0.8)` } : { background: "#fff", border: `2px solid ${C.line2}`, color: "#A8A29E" }) }}>{hecho ? "✓" : i + 1}</span>
                      <span style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff", padding: "0 10px 0 2px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: on ? C.orange : p.ok ? C.green : "#A8A29E" }}>{p.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: p.ok || on ? C.ink : "#A8A29E" }}>{p.ok ? p.val : on ? "Ahora" : "Pendiente"}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 600, lineHeight: 1, transition: "color 0.4s", color: TEMA_COLOR[Math.min(3, hechos)] }}>{hechos}/3</div>
              </div>
            </div>

            {/* Área de trabajo a todo lo ancho */}
            <div style={{ ...card, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "20px 24px 18px", gap: 16 }}>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 28 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.4 }}>{pregunta}</div>
                    </div>
                    {step === 1 && !sinCat && ninguna && (
                      <button type="button" onClick={() => toggle(ninguna)} style={{ flex: "none", width: 420, maxWidth: "48%", height: 66, padding: "0 22px", borderRadius: 14, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, ...opcion(tieneNinguna) }}>
                        <span style={{ whiteSpace: "nowrap" }}>Ninguna pieza estaba dañada</span>
                        <span style={{ flex: "none", fontSize: 14, fontWeight: 600, padding: "4px 12px", borderRadius: 12, ...(tieneNinguna ? { background: C.orange, color: "#fff" } : { background: C.soft2, color: C.faint }) }}>Orientación</span>
                      </button>
                    )}
                  </div>

                  {step === 1 && !sinCat && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                      {reales.map((p) => <button key={p.id} type="button" onClick={() => toggle(p)} style={{ height: 66, borderRadius: 14, fontSize: 18, padding: "0 10px", ...opcion(sel.includes(p.id)) }}>{p.nombre}</button>)}
                      {nuevaPieza === null && <button type="button" onClick={() => { setNuevaPieza(""); setAddMsg(""); }} style={{ height: 66, borderRadius: 14, border: "2px dashed #D9B48A", background: "#FFFCF7", color: C.orangeDark, fontSize: 18, fontWeight: 700 }}>+ Otra pieza</button>}
                    </div>
                  )}
                  {step === 1 && !sinCat && nuevaPieza !== null && inputNuevo(nuevaPieza, setNuevaPieza, agregarPieza, `Nueva pieza para ${nm(turno.modelo_codigo)}`, C.orange)}

                  {step === 2 && p1ok && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {opcionesRes.map(([r, t, d]) => {
                        const on = res === r;
                        return (
                          <button key={r} type="button" onClick={() => setRes(r)} style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 22px", borderRadius: 14, textAlign: "left", ...opcion(on), fontWeight: 400 }}>
                            <span style={radio(on)} />
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                              <span style={{ fontSize: 20, fontWeight: 700 }}>{t}</span>
                              <span style={{ fontSize: 16, color: C.muted }}>{d}</span>
                            </span>
                          </button>
                        );
                      })}
                      {noQuiso && (
                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 14, background: "#F4FBF6", border: "1px solid #BFE3CB" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d="M20 6 9 17l-5-5" /></svg>
                          <span style={{ fontSize: 18, color: C.greenDark }}><b>Tu parte terminó.</b> Ahora el cliente pasa a Anthony.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 3 && !noQuiso && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                      {causas.map((c) => <button key={c.id} type="button" onClick={() => setCausa(c.nombre)} style={{ minHeight: 62, padding: "4px 12px", borderRadius: 14, fontSize: 16, ...(causa === c.nombre ? { border: `2px solid ${C.ink}`, background: C.ink, color: "#fff", fontWeight: 700 } : { border: `1px solid ${C.line2}`, background: "#fff", color: C.ink, fontWeight: 500 }) }}>{c.nombre}</button>)}
                      {nuevaCausa === null && <button type="button" onClick={() => { setNuevaCausa(""); setAddMsg(""); }} style={{ minHeight: 62, borderRadius: 14, border: "2px dashed #A8A29E", background: C.soft, color: C.ink, fontSize: 17, fontWeight: 700 }}>+ Otra causa</button>}
                    </div>
                  )}
                  {step === 3 && !noQuiso && nuevaCausa !== null && inputNuevo(nuevaCausa, setNuevaCausa, agregarCausa, "Nueva causa", C.ink)}

                  {addMsg && <div style={{ flex: "none", fontSize: 14, fontWeight: 600, padding: "10px 14px", borderRadius: 12, background: C.soft2, color: C.ink2 }}>{addMsg}</div>}
                  {err && <div style={{ flex: "none", fontSize: 14, fontWeight: 600, padding: "10px 14px", borderRadius: 12, background: C.redSoft, color: C.redDark }}>{err}</div>}
                </div>

                <div style={{ flex: "none", display: "flex", gap: 12, paddingTop: 16, borderTop: `1px solid ${C.soft2}` }}>
                  <button type="button" onClick={atras} disabled={step === 1}
                    style={{ flex: "none", width: 190, height: 72, borderRadius: 16, fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      ...(step > 1 ? { border: "none", background: C.red, color: "#fff", boxShadow: "0 10px 22px -12px rgba(185,28,28,0.7)" } : { border: "none", background: C.soft2, color: C.line3 }) }}>
                    {flecha("m15 18-6-6 6-6")}Atrás
                  </button>
                  <button type="button" onClick={avanzar} disabled={!okPaso || busy}
                    style={{ flex: 1, height: 72, borderRadius: 16, border: "none", fontSize: 22, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      ...(okPaso ? { background: C.green, boxShadow: "0 10px 22px -10px rgba(21,128,61,0.7)" } : { background: C.gris }) }}>
                    {avanzarTxt}{flecha("m9 18 6-6-6-6")}
                  </button>
                </div>
            </div>
          </div>
        </>
      )}

      {(screen === "work" || screen === "pin") && !turnoPin && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...card, padding: 36, width: 480, textAlign: "center", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Este turno ya no está abierto</div>
            <div style={{ fontSize: 15, color: C.faint }}>Lo cerraron o anularon desde otro equipo.</div>
            <button type="button" onClick={volver} style={S.btn(C.ink)}>Volver a la lista de espera</button>
          </div>
        </div>
      )}

      {screen === "done" && done && (
        <>
          <TopBar />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ ...card, boxShadow: "0 24px 48px -24px rgba(28,25,23,0.25)", padding: "44px 56px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 560, textAlign: "center" }}>
              <div style={{ paddingTop: 26 }}><Calentador nivel={3} k={2.2} /></div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.3 }}>{done.anthony ? "Turno enviado a Anthony" : "Turno terminado"}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#DC2626" }}>{done.anthony ? "Le pasaste el cliente a Anthony" : `¡Ese calentador quedó caliente, ${done.nombre}!`}{statsDone ? ` · ${statsDone.n} hoy · vas ${statsDone.pos}º` : ""}</div>
              <div style={{ fontSize: 15, color: C.faint }}>{done.txt}</div>
              <button type="button" onClick={volver} style={{ ...S.btn(C.ink), marginTop: 10, height: 56, padding: "0 28px" }}>Volver a la lista de espera</button>
              <div style={{ fontSize: 13, color: C.faint }}>Tu sesión se cierra sola en {Math.max(0, cuenta)} s · el próximo cliente pide PIN otra vez</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
