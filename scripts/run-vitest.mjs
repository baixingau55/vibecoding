import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const tempRoot = path.join(process.cwd(), ".tmp", "vitest");
fs.mkdirSync(tempRoot, { recursive: true });

const vitestBin = path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2);

const child = spawn(process.execPath, [vitestBin, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    TMP: tempRoot,
    TEMP: tempRoot,
    TMPDIR: tempRoot
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
