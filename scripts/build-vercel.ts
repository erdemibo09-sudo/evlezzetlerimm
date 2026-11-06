import { stripTypeScriptTypes } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const files = [
  "src/domain/money.ts",
  "src/domain/orderFsm.ts",
  "src/domain/turkeyLocations.ts",
  "src/domain/validation.ts",
  "src/services/cryptoUtils.ts",
  "src/db/database.ts",
  "src/services/authService.ts",
  "src/services/auditService.ts",
  "src/services/productService.ts",
  "src/services/emailService.ts",
  "src/services/orderService.ts",
  "src/services/supabaseSync.ts",
  "src/ui/indexHtml.ts",
  "src/app.ts",
  "src/vercelEntry.ts",
];

const header = [
  'import { DatabaseSync } from "node:sqlite";',
  'import { Buffer } from "node:buffer";',
  'import process from "node:process";',
  'import { copyFileSync, existsSync, readFileSync } from "node:fs";',
  'import { readFile } from "node:fs/promises";',
  'import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";',
  "",
].join("\n");

const chunks = [header];

for (const f of files) {
  const tsCode = readFileSync(f, "utf8");
  let jsCode = stripTypeScriptTypes(tsCode, { mode: "transform" });
  jsCode = jsCode.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, "");
  if (f !== "src/vercelEntry.ts") {
    jsCode = jsCode.replace(/export\s+(async\s+function|function|const|let|class)/g, "$1");
    jsCode = jsCode.replace(/export\s+\{[^}]*\};?/g, "");
  }
  chunks.push(`// --- ${f} ---\n` + jsCode.trim());
}

mkdirSync("api", { recursive: true });
writeFileSync("api/index.mjs", chunks.join("\n\n") + "\n", "utf8");
console.log("Generated api/index.mjs successfully!");
