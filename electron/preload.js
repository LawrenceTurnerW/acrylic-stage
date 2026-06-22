// Renderer に最小の API を露出する preload。
// Day 1-2 では空でも良いが、将来 IPC を足す場所として置いておく。

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("acrylic", {
  version: "0.1.0",
});
