const path = require("node:path");

const appRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "phubai-mes-web",
      cwd: appRoot,
      script: path.join(appRoot, "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 3002",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "phubai-mes-energy-cron",
      cwd: appRoot,
      script: path.join(appRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      args: "scripts/energy-cron.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
