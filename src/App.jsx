<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Turnos · Marey</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { height: 100%; }
    body { font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #F3F2EF; color: #1C1917; }
    button { cursor: pointer; font-family: inherit; }
    button:disabled { cursor: not-allowed; }
    input, select { font-family: inherit; outline: none; }
    input:focus, select:focus { border-color: #B45309 !important; box-shadow: 0 0 0 3px rgba(180,83,9,0.14); background-color: #FFFFFF !important; }
    input::placeholder { color: #A8A29E; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
