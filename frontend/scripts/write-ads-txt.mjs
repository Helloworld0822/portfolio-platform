// Writes dist/ads.txt from the same VITE_ADSENSE_CLIENT_ID used to load the
// AdSense script (see src/lib/adsense.ts). No-ops until that env var is set.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const clientId = process.env.VITE_ADSENSE_CLIENT_ID;
if (!clientId) {
  process.exit(0);
}

const pubId = clientId.replace(/^ca-/, "");
const distDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
writeFileSync(path.join(distDir, "ads.txt"), `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`);
