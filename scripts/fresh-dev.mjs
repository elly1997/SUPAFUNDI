/**
 * Free port 3000, clean .next, start a single dev server.
 * Prevents 404s on CSS/JS from stale builds or 3000 vs 3001 mismatch.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { spawn, execSync } from "node:child_process";

const port = process.env.PORT ?? "3000";

function killPortWindows(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`Stopped process ${pid} on port ${p}`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* port free */
  }
}

if (process.platform === "win32") {
  killPortWindows(port);
  if (port === "3000") killPortWindows("3001");
}

try {
  rmSync(".next", { recursive: true, force: true });
  console.log("Removed .next — starting fresh dev build…");
} catch (err) {
  console.warn("Could not remove .next:", err);
}

const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "dev", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, PORT: port },
});

child.on("exit", (code) => process.exit(code ?? 0));
