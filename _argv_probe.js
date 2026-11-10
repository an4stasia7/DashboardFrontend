const { spawn } = require("child_process");
const fs = require("fs");
const node = process.execPath;
const dump = "C:\\Users\\testii\\Downloads\\dash\\DashboardFrontend\\_dump_cmd.js";
const out = "C:\\Users\\testii\\Downloads\\dash\\DashboardFrontend\\_cmd.txt";
const inner = [
  '"' + node + '"',
  '"' + dump + '"',
  "ENTERPRISE",
  '/N"Прокопчук Лидия Александровна"',
  '/P"secret pass"',
  "/WA-",
  '/URL"e1cib/app/Отчет?a=1&b=2"',
].join(" ");
const child = spawn(
  "C:\\Windows\\System32\\cmd.exe",
  ["/d", "/s", "/c", '"' + inner + '"'],
  { windowsVerbatimArguments: true }
);
child.on("close", (code) => {
  process.stdout.write("exit " + code + "\n");
});
