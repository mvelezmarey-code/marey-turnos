import React, { useState, useEffect } from "react";
import Recepcion from "./Recepcion.jsx";
import Admin from "./Admin.jsx";

function esRutaAdmin() {
  const h = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
  return h === "admin";
}

export default function App() {
  const [admin, setAdmin] = useState(esRutaAdmin());
  useEffect(() => {
    const onHash = () => setAdmin(esRutaAdmin());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return admin ? <Admin /> : <Recepcion />;
}
