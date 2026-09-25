import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = join(root, "dist");
const tempPath = join(root, `.dist-build-${process.pid}`);

rmSync(tempPath, { recursive: true, force: true });
mkdirSync(tempPath, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

try {
  run(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", tempPath]);
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.server.json"]);

  const backupPath = `${distPath}.previous`;
  rmSync(backupPath, { recursive: true, force: true });
  let previousMoved = false;
  try {
    if (existsSync(distPath)) {
      renameSync(distPath, backupPath);
      previousMoved = true;
    }
    renameSync(tempPath, distPath);
    rmSync(backupPath, { recursive: true, force: true });
  } catch (swapError) {
    // Windows can keep the existing dist directory open (Explorer, antivirus,
    // hosting sync tools, etc.). Preserve the successful build by falling back
    // to an in-place copy when the atomic directory rename is unavailable.
    if (previousMoved && !existsSync(distPath)) renameSync(backupPath, distPath);
    if (existsSync(tempPath)) {
      mkdirSync(distPath, { recursive: true });
      cpSync(tempPath, distPath, { recursive: true, force: true });
      rmSync(tempPath, { recursive: true, force: true });
      if (existsSync(backupPath)) rmSync(backupPath, { recursive: true, force: true });
    } else {
      throw swapError;
    }
  }
} catch (error) {
  rmSync(tempPath, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
