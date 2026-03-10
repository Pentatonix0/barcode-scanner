const { contextBridge, ipcRenderer } = require("electron");

const IPC_SHOW_ITEM_IN_FOLDER = "desktop:show-item-in-folder";

function parseRuntimeConfigFromArgs() {
  const prefix = "--app-runtime=";
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return {};

  try {
    const encoded = arg.slice(prefix.length);
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return {};
  }

  return {};
}

contextBridge.exposeInMainWorld(
  "__APP_RUNTIME_CONFIG__",
  parseRuntimeConfigFromArgs()
);

contextBridge.exposeInMainWorld("__DESKTOP_API__", {
  async showItemInFolder(filePath) {
    const result = await ipcRenderer.invoke(IPC_SHOW_ITEM_IN_FOLDER, filePath);
    if (!result || result.ok !== true) {
      throw new Error(result?.error || "Failed to open file location");
    }
  },
});
