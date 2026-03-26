const asyncHandler = require("express-async-handler");
const Application = require("../models/applicationModel");
const ApiError = require("../utils/apiError");
const { getIO } = require("../config/socket");

const {
    emitToUser,
    emitToJob
} = require("../config/socket")

/* ================= HELPERS ================= */

const assertState = (current, allowed, msg) => {
  if (!allowed.includes(current)) {
    throw new ApiError(msg, 400);
  }
};


/* ================================================= */
/* ================= ON THE WAY ===================== */
/* ================================================= */

exports.onTheWay = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate("jobId", "status employerId");

  if (!app) throw new ApiError("Application not found", 404);

  if (!app.workerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (app.status !== "accepted") {
    throw new ApiError("Application not accepted", 400);
  }

  if (!app.jobId || app.jobId.status !== "confirmed") {
    throw new ApiError("Job is not active", 400);
  }

  assertState(app.shiftStatus, ["not_started"], "Invalid state");

  app.shiftStatus = "on_the_way";
  app.onTheWayAt = new Date();

  await app.save();

  emitToJob(app.jobId._id, "worker_on_the_way", {
    appId: app._id,
    workerId: app.workerId,
    status: "on_the_way",
    time: new Date(),
  });

  res.json({ status: "success" });
});

/* ================================================= */
/* ================= ARRIVE ========================= */
/* ================================================= */

exports.arrive = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate("jobId", "status employerId");

  if (!app) throw new ApiError("Application not found", 404);

  if (!app.workerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (app.status !== "accepted") {
    throw new ApiError("Application not accepted", 400);
  }

  if (!app.jobId || app.jobId.status !== "confirmed") {
    throw new ApiError("Job is not active", 400);
  }

  assertState(app.shiftStatus, ["on_the_way"], "Worker must be on the way first");

  app.shiftStatus = "arrived";
  app.arrivalStatus = "arrived";
  app.arrivedAt = new Date();

  await app.save();

  emitToJob(app.jobId._id, "worker_arrived", {
    appId: app._id,
    workerId: app.workerId,
    status: "arrived",
    time: new Date(),
  });

  res.json({ status: "success" });
});

/* ================================================= */
/* ============ APPROVE ARRIVAL ===================== */
/* ================================================= */

exports.approveArrival = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate("jobId", "employerId status");

  if (!app) throw new ApiError("Application not found", 404);

  if (!app.jobId) {
    throw new ApiError("Job not found", 404);
  }

  if (!app.jobId.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  assertState(app.shiftStatus, ["arrived"], "Worker must arrive first");

  app.shiftStatus = "arrived_approved";
  app.arrivalApprovedAt = new Date();

  await app.save();

  emitToUser(app.workerId, "arrival_approved", {
    appId: app._id,
    status: "arrived_approved",
    time: new Date(),
  });

  res.json({ status: "success" });
});

/* ================================================= */
/* ================= START SHIFT ==================== */
/* ================================================= */

exports.startShift = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate("jobId", "employerId");

  if (!app) throw new ApiError("Application not found", 404);

  if (!app.jobId.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (app.shiftStartedAt) {
    throw new ApiError("Shift already started", 400);
  }

  assertState(app.shiftStatus, ["arrived_approved"], "Must approve arrival first");

  app.shiftStatus = "in_progress";
  app.shiftStartedAt = new Date();

  await app.save();

  emitToUser(app.workerId, "shift_started", {
    appId: app._id,
    status: "in_progress",
    time: new Date(),
  });

  res.json({ status: "success" });
});

/* ================================================= */
/* ================= END SHIFT ====================== */
/* ================================================= */

exports.endShift = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate("jobId", "employerId");

  if (!app) throw new ApiError("Application not found", 404);

  if (!app.jobId.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  assertState(app.shiftStatus, ["in_progress"], "Shift not started");

  const duration = Date.now() - new Date(app.shiftStartedAt).getTime();

  if (duration < 30 * 60 * 1000) {
    throw new ApiError("Shift too short", 400);
  }

  app.shiftStatus = "completed";
  app.shiftEndedAt = new Date();

  await app.save();

  emitToUser(app.workerId, "shift_completed", {
    appId: app._id,
    status: "completed",
    time: new Date(),
  });

  res.json({ status: "success" });
});

/* ================================================= */
/* ========== WORKER CONFIRM COMPLETION ============= */
/* ================================================= */

exports.workerConfirm = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id);

  if (!app) throw new ApiError("Application not found", 404);

  if (!app.workerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (app.shiftStatus !== "completed") {
    throw new ApiError("Shift not completed yet", 400);
  }

  if (!app.shiftEndedAt) {
    throw new ApiError("Shift not ended properly", 400);
  }

  app.workerConfirmedCompletion = true;

  await app.save();

  res.json({ status: "success" });
});