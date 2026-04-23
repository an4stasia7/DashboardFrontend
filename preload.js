"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  isElectron: true,
  getAppVersion: function () {
    return ipcRenderer.invoke("app:get-version");
  },
  openExternal: function (targetUrl) {
    return ipcRenderer.invoke("app:open-external", targetUrl);
  },
  runSelfUpdate: function () {
    return ipcRenderer.invoke("app:run-self-update");
  },
});
