const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");

const { BrowserWindow, app, dialog, ipcMain, shell } = require("electron");

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 350;
const BACKEND_STOP_TIMEOUT_MS = 5_000;
const BACKEND_FORCE_STOP_TIMEOUT_MS = 2_000;
const IPC_SHOW_ITEM_IN_FOLDER = "desktop:show-item-in-folder";

let backendProcess = null;
let isQuitting = false;
let backendLogStream = null;
let backendStopPromise = null;
let isQuitFlowInProgress = false;
let mainWindow = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function log(...args) {
  console.log("[desktop]", ...args);
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            stdout: stdout?.toString() ?? "",
            stderr: stderr?.toString() ?? "",
          })
        );
        return;
      }
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
      });
    });
  });
}

function waitForChildExit(child, timeoutMs) {
  if (!child) return Promise.resolve(true);
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };

    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);

    child.once("exit", onExit);
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

ipcMain.handle(IPC_SHOW_ITEM_IN_FOLDER, async (_event, targetPath) => {
  const normalizedPath = String(targetPath ?? "").trim();
  if (!normalizedPath) {
    return { ok: false, error: "File path is empty" };
  }

  const resolvedPath = path.normalize(normalizedPath);
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File not found: ${resolvedPath}` };
  }

  try {
    shell.showItemInFolder(resolvedPath);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

function resolveBackendExecutable() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "barcode-backend.exe");
  }

  return path.join(__dirname, "..", "backend", "dist", "barcode-backend.exe");
}

function ensureRuntimeDirs() {
  const dataRoot = path.join(app.getPath("userData"), "data");
  const sessionsDir = path.join(dataRoot, "sessions");
  const logsDir = path.join(dataRoot, "logs");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  return {
    dataRoot,
    sessionsDir,
    logsDir,
    sqlitePath: path.join(dataRoot, "scanner.sqlite"),
    catalogPath: path.join(dataRoot, "catalog.xlsx"),
    backendLogPath: path.join(logsDir, "backend.log"),
  };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate local port")));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function waitForHealth(healthUrl, timeoutMs = HEALTH_TIMEOUT_MS) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const req = http.get(healthUrl, { timeout: 2000 }, (res) => {
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
        res.resume();
        if (ok) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Backend health check failed with status ${res.statusCode}`));
          return;
        }
        setTimeout(tryRequest, HEALTH_POLL_INTERVAL_MS);
      });

      req.on("timeout", () => req.destroy(new Error("Health request timeout")));

      req.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("Backend did not become ready before timeout"));
          return;
        }
        setTimeout(tryRequest, HEALTH_POLL_INTERVAL_MS);
      });
    };

    tryRequest();
  });
}

function startBackend({ host, port, runtimeDirs }) {
  const executable = resolveBackendExecutable();
  if (!fs.existsSync(executable)) {
    throw new Error(`Backend executable not found: ${executable}`);
  }

  backendLogStream = fs.createWriteStream(runtimeDirs.backendLogPath, { flags: "a" });
  backendLogStream.write(
    `\n[${new Date().toISOString()}] Starting backend executable: ${executable}\n`
  );

  const child = spawn(executable, ["--host", host, "--port", String(port)], {
    cwd: runtimeDirs.dataRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      SERVER_DEBUG: "false",
      SERVER_ACCESS_LOG: "true",
      SQLITE_DB_PATH: runtimeDirs.sqlitePath,
      CATALOG_PATH: runtimeDirs.catalogPath,
      SESSIONS_EXPORT_DIR: runtimeDirs.sessionsDir,
      SERIAL_PORT: process.env.SERIAL_PORT || "COM1",
      SERIAL_BAUDRATE: process.env.SERIAL_BAUDRATE || "9600",
      SERIAL_TIMEOUT: process.env.SERIAL_TIMEOUT || "0.1",
      SERIAL_RECONNECT_DELAY: process.env.SERIAL_RECONNECT_DELAY || "2.0",
    },
  });

  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    log(`[backend] ${text.trimEnd()}`);
    backendLogStream?.write(`[stdout] ${text}`);
  });
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    log(`[backend:err] ${text.trimEnd()}`);
    backendLogStream?.write(`[stderr] ${text}`);
  });

  child.on("exit", (code, signal) => {
    log(`Backend exited (code=${code}, signal=${signal})`);
    backendLogStream?.write(
      `\n[${new Date().toISOString()}] Backend exited (code=${code}, signal=${signal})\n`
    );
    backendLogStream?.end();
    backendLogStream = null;
    backendProcess = null;
    if (!isQuitting) {
      dialog.showErrorBox(
        "Backend stopped",
        "Локальный backend-процесс был остановлен.\n\n"
          + `Лог: ${runtimeDirs.backendLogPath}\n`
          + `Код: ${code ?? "n/a"}, сигнал: ${signal ?? "n/a"}\n`
          + "Перезапустите приложение и проверьте лог."
      );
      app.quit();
    }
  });

  backendProcess = child;
}

async function stopBackend(reason = "unknown") {
  if (backendStopPromise) {
    return backendStopPromise;
  }

  const child = backendProcess;
  if (!child) return;

  backendStopPromise = (async () => {
    log(`Stopping backend (pid=${child.pid}, reason=${reason})`);
    let exited = false;

    try {
      if (process.platform === "win32") {
        try {
          await execFileAsync("taskkill", ["/pid", String(child.pid), "/t"]);
        } catch (error) {
          log(
            "Graceful taskkill failed:",
            error instanceof Error ? error.message : String(error)
          );
        }

        exited = await waitForChildExit(child, BACKEND_STOP_TIMEOUT_MS);
        if (!exited) {
          log("Backend did not exit gracefully, forcing taskkill /f");
          try {
            await execFileAsync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
          } catch (error) {
            log(
              "Forced taskkill failed:",
              error instanceof Error ? error.message : String(error)
            );
          }
          exited = await waitForChildExit(child, BACKEND_FORCE_STOP_TIMEOUT_MS);
        }
      } else {
        try {
          child.kill("SIGTERM");
        } catch (error) {
          log("SIGTERM failed:", error instanceof Error ? error.message : String(error));
        }

        exited = await waitForChildExit(child, BACKEND_STOP_TIMEOUT_MS);
        if (!exited) {
          log("Backend did not exit after SIGTERM, forcing SIGKILL");
          try {
            child.kill("SIGKILL");
          } catch (error) {
            log("SIGKILL failed:", error instanceof Error ? error.message : String(error));
          }
          exited = await waitForChildExit(child, BACKEND_FORCE_STOP_TIMEOUT_MS);
        }
      }
    } finally {
      if (!exited) {
        log(`Backend still appears to be running after stop attempts (pid=${child.pid})`);
      }
      backendProcess = null;
    }
  })().finally(() => {
    backendStopPromise = null;
  });

  return backendStopPromise;
}

function createMainWindow({ apiUrl, wsUrl }) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    return window;
  }

  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  window.loadFile(indexPath, {
    query: {
      apiUrl,
      wsUrl,
    },
  });
  return window;
}

async function bootstrap() {
  const runtimeDirs = ensureRuntimeDirs();
  const host = "127.0.0.1";
  const port = await findFreePort();
  const apiUrl = `http://${host}:${port}`;
  const wsUrl = `ws://${host}:${port}/ws`;

  startBackend({ host, port, runtimeDirs });
  await waitForHealth(`${apiUrl}/health`);
  createMainWindow({ apiUrl, wsUrl });
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    focusMainWindow();
  });
}

app.on("before-quit", (event) => {
  isQuitting = true;
  if (!backendProcess) return;
  if (isQuitFlowInProgress) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  isQuitFlowInProgress = true;
  void stopBackend("before-quit").finally(() => {
    isQuitFlowInProgress = false;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  try {
    await bootstrap();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Startup failed", detail);
    app.quit();
  }
});
