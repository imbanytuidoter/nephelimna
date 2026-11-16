import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { proxy: { "/api": { target: "http://127.0.0.1:3430", rewrite: (path) => path.replace(/^\/api/, "") } } },
  resolve: { conditions: ["source"] },
  build: { license: { fileName: "licenses.md" } },
  plugins: [
    {
      name: "third-party-notices",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "THIRD_PARTY_NOTICES.md",
          source: readFileSync("src/ocean/THIRD_PARTY_NOTICES.md", "utf8"),
        });
        this.emitFile({
          type: "asset",
          fileName: "OCEAN_LICENSE.txt",
          source: readFileSync("src/ocean/LICENSE", "utf8"),
        });
      },
    },
  ],
});
