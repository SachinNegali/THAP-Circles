module.exports = {
  apps: [
    {
      name: 'Thaf-fi',
      script: './index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8081
      }
    },
    {
      name: 'Thaf-piston',
      script: './trackingServer.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        TRACKING_SERVER_PORT: 9001
      }
    }
  ]
};
