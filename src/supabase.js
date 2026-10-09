import { createClient } from "@supabase/supabase-js";

// Proyecto Supabase de Turnos. La anon key es pública por diseño:
// toda escritura pasa por funciones (RPC) y el PIN nunca se puede leer.
export const supabase = createClient(
  "https://sucpckedujxkyeutlgzy.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Y3Bja2VkdWp4a3lldXRsZ3p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDM2NzgsImV4cCI6MjEwNjk3OTY3OH0.gRlvNgpZHW-x3vB3WnZJGuSzhog_tGkHhW8YRX9c38k"
);
