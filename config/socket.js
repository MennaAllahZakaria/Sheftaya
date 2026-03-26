const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

let io;

exports.initSocket = (server) => {
  io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ["websocket"],
    cors: {
      origin: "*",
    },
  });

  /* ================= AUTH ================= */

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET_KEY
      );

      if (!decoded?.userId) {
        return next(new Error("Invalid token"));
      }

      const user = await User.findById(decoded.userId).select("_id role");

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;

      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  /* ================= CONNECTION ================= */

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    console.log(`✅ Connected: ${userId}`);

    /* ================= ROOMS ================= */

    // user room (notifications)
    socket.join(`user:${userId}`);

    // role room (broadcast later)
    socket.join(`role:${socket.user.role}`);

    /* ================= SHIFT / JOB ROOMS ================= */

    // join job room (for real-time shift updates)
    socket.on("join_job", (jobId) => {
      if (!jobId) return;

      socket.join(`job:${jobId}`);

      console.log(`User ${userId} joined job:${jobId}`);
    });

    socket.on("leave_job", (jobId) => {
      if (!jobId) return;

      socket.leave(`job:${jobId}`);
    });

    /* ================= DEBUG ================= */

    socket.on("pingCheck", () => {
      socket.emit("pongCheck", { time: Date.now() });
    });

    /* ================= DISCONNECT ================= */

    socket.on("disconnect", (reason) => {
      console.log(`❌ Disconnected: ${userId} | ${reason}`);
    });
  });
};

/* ================= SAFE GETTER ================= */

exports.getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

/* ================= HELPERS (IMPORTANT) ================= */

exports.emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

exports.emitToJob = (jobId, event, data) => {
  if (!io) return;
  io.to(`job:${jobId}`).emit(event, data);
};

exports.emitToRole = (role, event, data) => {
  if (!io) return;
  io.to(`role:${role}`).emit(event, data);
};