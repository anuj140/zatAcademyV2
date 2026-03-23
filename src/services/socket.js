const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

let io;

// Maps userId (string) → Set of socketIds (in case same user has multiple tabs)
const userSocketMap = new Map();

/**
 * Initialize Socket.io on the HTTP server.
 * Call this once from server.js after creating the HTTP server.
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Tighten this in production
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    /**
     * Client emits "authenticate" right after connecting:
     *   socket.emit("authenticate", { token: "<JWT>" })
     * Server verifies token and registers the user's socketId.
     */
    socket.on("authenticate", async ({ token } = {}) => {
      if (!token) {
        socket.emit("auth_error", { message: "Token required" });
        return;
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("_id role isActive");

        if (!user || !user.isActive) {
          socket.emit("auth_error", { message: "User not found or inactive" });
          return;
        }

        // Register socket for this user
        const uid = user._id.toString();
        if (!userSocketMap.has(uid)) {
          userSocketMap.set(uid, new Set());
        }
        userSocketMap.get(uid).add(socket.id);

        // Attach userId to socket for cleanup on disconnect
        socket.userId = uid;

        socket.emit("authenticated", { message: "Socket authenticated", userId: uid });
        console.log(`✅ Socket authenticated: user=${uid}, socketId=${socket.id}`);
      } catch (err) {
        console.error("Socket auth error:", err.message);
        socket.emit("auth_error", { message: "Invalid or expired token" });
      }
    });

    socket.on("disconnect", () => {
      if (socket.userId) {
        const sockets = userSocketMap.get(socket.userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSocketMap.delete(socket.userId);
          }
        }
        console.log(`🔴 Socket disconnected: user=${socket.userId}, socketId=${socket.id}`);
      } else {
        console.log(`🔴 Socket disconnected (unauthenticated): ${socket.id}`);
      }
    });
  });

  console.log("🚀 Socket.io initialized");
  return io;
};

/**
 * Returns the initialized Socket.io instance.
 * Use this in controllers: const io = getIO();
 */
const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized. Call initSocket(server) first.");
  return io;
};

/**
 * Emit an event to a specific user across all their connected sockets.
 * @param {string} userId
 * @param {string} event
 * @param {object} data
 */
const emitToUser = (userId, event, data) => {
  const sockets = userSocketMap.get(userId.toString());
  if (!sockets || sockets.size === 0) return; // User is offline — that's fine
  const ioInstance = getIO();
  sockets.forEach((socketId) => {
    ioInstance.to(socketId).emit(event, data);
  });
};

module.exports = { initSocket, getIO, emitToUser };
