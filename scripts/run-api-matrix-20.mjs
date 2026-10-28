import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--import", "tsx", "--test", "server/apiContract.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, API_TRANSITIONS_PER_ROUTE: "20" },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
