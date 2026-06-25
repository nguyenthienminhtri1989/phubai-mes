/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

const appRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "phubai-mes-web",
      cwd: appRoot,
      script: path.join(appRoot, "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 3002",
      windowsHide: true,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "phubai-mes-energy-cron",
      cwd: appRoot,
      script: path.join(appRoot, "scripts", "energy-cron.js"),
      interpreter: "node",
      windowsHide: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
