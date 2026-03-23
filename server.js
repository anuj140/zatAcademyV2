require('dotenv').config();
const http = require("http");
const app = require('./src/app');
const { initSocket } = require("./src/services/socket");

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Initialize Socket.io on the server
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});