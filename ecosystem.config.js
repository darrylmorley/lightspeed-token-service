module.exports = {
  apps: [{
    name: 'lightspeed-token-service',
    script: 'bun',
    args: 'run server.ts',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    // Restart policy
    restart_delay: 5000,          // Wait 5 seconds before restart
    max_restarts: 10,             // Max 10 restarts per minute
    min_uptime: '10s',            // Must be up for 10 seconds to be considered started
    
    // Error handling
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Health monitoring
    health_check_grace_period: 30000,  // 30 seconds grace period
    
    // Advanced restart conditions
    ignore_watch: ['node_modules', 'logs'],
    
    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100,
    
    // Kill timeout
    kill_timeout: 5000,
    
    // Listen timeout
    listen_timeout: 8000,
  }]
};