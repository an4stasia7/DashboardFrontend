"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  isElectron: true,
});
