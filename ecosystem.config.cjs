module.exports = {
  apps: [
    {
      name: "phubai-mes-web",
      cwd: "D:/PHUBAI-MES/phubai-mes",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "phubai-mes-energy-cron",
      cwd: "D:/PHUBAI-MES/phubai-mes",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/energy-cron.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
