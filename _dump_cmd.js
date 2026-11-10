const fs = require("fs");
const { execFileSync } = require("child_process");
const cmd = execFileSync(
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  ["-NoProfile", "-Command", "(Get-CimInstance Win32_Process -Filter \"ProcessId=" + process.pid + "\").CommandLine"],
  { encoding: "utf8" }
);
fs.writeFileSync(
  "C:\\Users\\testii\\Downloads\\dash\\DashboardFrontend\\_cmd.txt",
  JSON.stringify({ argv: process.argv, cmd: cmd }, null, 2),
  "utf8"
);
