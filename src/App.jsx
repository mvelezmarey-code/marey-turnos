import React, { useState, useEffect } from "react";
import Recepcion from "./Recepcion.jsx";
import Reparacion from "./Reparacion.jsx";
import Admin from "./Admin.jsx";

// Rutas por hash para que cada equipo abra su vista directo:
//   computadora de recepcion -> /  o  /#/recepcion
//   iPad de reparacion       -> /#/reparacion
//   admin                    -> /#/admin
function ruta() {
  return (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
}

export default function App() {
  const [r, setR] = useState(ruta());
  useEffect(() => {
    const onHash = () => setR(ruta());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (r === "admin") return <Admin />;
  if (r === "reparacion") return <Reparacion />;
  return <Recepcion />;
}
