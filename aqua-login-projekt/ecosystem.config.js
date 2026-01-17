module.exports = {
  apps: [
    {
      name: "aqualog",
      script: "server.js",
      cwd: __dirname,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
