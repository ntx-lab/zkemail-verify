import { defineConfig } from "vite";

export default defineConfig({
  base: "/zkemail-verify/",
  optimizeDeps: {
    exclude: ["@zk-email/sdk"],
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
