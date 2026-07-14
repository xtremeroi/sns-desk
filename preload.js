const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sns", {
  punch: (action, opts) => ipcRenderer.invoke("punch", action, opts),
  refresh: () => ipcRenderer.invoke("refresh"),
  login: () => ipcRenderer.invoke("login"),
  openTimePage: () => ipcRenderer.invoke("open-time-page"),
  setExclude: (apps) => ipcRenderer.invoke("set-exclude", apps),
  hidePopup: () => ipcRenderer.invoke("hide-popup"),
  quit: () => ipcRenderer.invoke("quit"),
  onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
});
