import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O plugin do Cloudflare roda o Worker (API + D1) dentro do próprio `vite dev`,
// no mesmo runtime (workerd) usado em produção.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
