import React, { useEffect, useState } from "react";
import Recepcion from "./Recepcion.jsx";
import Reparacion from "./Reparacion.jsx";
import Admin from "./Admin.jsx";
import { C } from "./lib.js";

// Rutas por hash para que cada equipo abra su vista directo:
//   computadora de recepción → /#/recepcion
//   iPad de reparación       → /#/reparacion
//   admin                    → /#/admin
const ruta = () => (window.location.hash || "").replace(/^#\/?/, "");

export default function App() {
  const [r, setR] = useState(ruta());
  useEffect(() => { const h = () => setR(ruta()); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  if (r === "recepcion") return <Recepcion />;
  if (r === "reparacion") return <Reparacion />;
  if (r === "admin") return <Admin />;
  const opts = [["recepcion", "Recepción", "Computadora de recepción: turnos y llamadas", C.orange], ["reparacion", "Reparación", "iPad de los técnicos", C.ink], ["admin", "Administración", "Volumen, sábados y expedientes", "#44403C"]];
  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>Turnos · Reparación Ventanilla</div>
        {opts.map(([k, t, s, bg]) => (
          <a key={k} href={"#/" + k} style={{ textDecoration: "none", background: bg, color: "#fff", borderRadius: 14, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{t}</span>
            <span style={{ fontSize: 14, opacity: 0.85 }}>{s}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
