"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  isElectron: true,
  getAppVersion: function () {
    return ipcRenderer.invoke("app:get-version");
  },
  getUpdateMode: function () {
    return ipcRenderer.invoke("app:get-update-mode");
  },
  getReleaseUpdateState: function () {
    return ipcRenderer.invoke("app:get-release-update-state");
  },
  checkReleaseUpdates: function () {
    return ipcRenderer.invoke("app:check-release-updates");
  },
  installReleaseUpdate: function () {
    return ipcRenderer.invoke("app:install-release-update");
  },
  onReleaseUpdateState: function (listener) {
    if (typeof listener !== "function") return function () {};
    var wrapped = function (_event, payload) {
      listener(payload);
    };
    ipcRenderer.on("app:release-update-state", wrapped);
    return function () {
      ipcRenderer.removeListener("app:release-update-state", wrapped);
    };
  },
  openExternal: function (targetUrl) {
    return ipcRenderer.invoke("app:open-external", targetUrl);
  },
  runSelfUpdate: function () {
    return ipcRenderer.invoke("app:run-self-update");
  },
  onWindowResize: function (listener) {
    if (typeof listener !== "function") return function () {};
    var wrapped = function () {
      listener();
    };
    ipcRenderer.on("app:window-resized", wrapped);
    return function () {
      ipcRenderer.removeListener("app:window-resized", wrapped);
    };
  },
});
