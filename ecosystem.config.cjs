/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

// PM2 ecosystem cho VPS Ubuntu (/home/deploy/apps/phubai-mes).
// Deploy thu cong qua Git: git pull -> npm ci -> prisma migrate deploy -> npm run build -> pm2 restart.
//
// Hai process chay TREN VPS:
//   - phubai-mes             : web app Next.js (port 3002)
//   - phubai-mes-energy-cron : cron chot so dien hang ngay 06:00 gio VN + don telemetry cu
//                              (energy-cron.js che do PUSH: KHONG con thu Modbus theo gio)
//
// LUU Y: energy-push-collector.js (doc Modbus + push HTTPS) chay o MAY VAN PHONG / mini PC
// tai nha may, KHONG nam trong ecosystem nay.

const appRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "phubai-mes",
      cwd: appRoot,
      script: path.join(appRoot, "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 3002",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "phubai-mes-energy-cron",
      cwd: appRoot,
      script: path.join(appRoot, "scripts", "energy-cron.js"),
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
