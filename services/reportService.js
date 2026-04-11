const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Report = require("../models/reportModel");
const Application = require("../models/applicationModel");
const penaltyService = require("./penaltyService");


exports.createReport = asyncHandler(async (req, res) => {
  const { applicationId, reason } = req.body;
  const reporterId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new ApiError("Invalid application ID", 400);
  }

  const reportImage =
    req.uploadedFiles?.reportImage?.[0] || null;

  const application = await Application.findById(applicationId)
    .populate("jobId", "employerId");

  if (!application) {
    throw new ApiError("Application not found", 404);
  }

  let reportedUser;

  if (application.workerId.equals(reporterId)) {
    reportedUser = application.jobId.employerId;
  } else if (application.jobId.employerId.equals(reporterId)) {
    reportedUser = application.workerId;
  } else {
    throw new ApiError("Unauthorized", 403);
  }

  const existing = await Report.findOne({
    applicationId,
    reporter: reporterId,
  });

  if (existing) {
    throw new ApiError("Already reported", 400);
  }

  const report = await Report.create({
    applicationId,
    reporter: reporterId,
    reportedUser,
    reason,
    reportImage,
  });

  res.status(201).json({
    status: "success",
    data: report,
  });
});

exports.getMyReports = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  let { page = 1, limit = 10 } = req.query;

  page = Math.max(1, parseInt(page));
  limit = Math.min(50, parseInt(limit));
  const skip = (page - 1) * limit;

  const filter = {
    $or: [{ reporter: userId }, { reportedUser: userId }],
  };

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate("applicationId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Report.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    page,
    results: reports.length,
    totalResults: total,
    totalPages: Math.ceil(total / limit),
    data: reports,
  });
});

exports.getAllReports = asyncHandler(async (req, res) => {
  const reports = await Report.find()
    .populate("reporter", "firstName lastName")
    .populate("reportedUser", "firstName lastName")
    .populate("applicationId")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: reports.length,
    data: reports,
  });
});

exports.updateReportStatus = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError("Unauthorized", 403);
  }

  const { status } = req.body;

  const allowed = [
    "under_review",
    "in_progress",
    "resolved",
    "rejected",
  ];

  if (!allowed.includes(status)) {
    throw new ApiError("Invalid status", 400);
  }

  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!report) {
    throw new ApiError("Report not found", 404);
  }

  res.status(200).json({
    status: "success",
    data: report,
  });
});

exports.resolveReport = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError("Unauthorized", 403);
  }

  const report = await Report.findById(req.params.id);

  if (!report) {
    throw new ApiError("Report not found", 404);
  }

  if (report.status === "resolved") {
    throw new ApiError("Already resolved", 400);
  }

  report.status = "resolved";
  await report.save();

  // async penalty (non-blocking)
  setImmediate(async () => {
    try {
      await penaltyService.reportIncident({
        userId: report.reportedUser,
        type: "report_resolved",
        severity: "high",
      });
    } catch (err) {
      console.error("Penalty error:", err.message);
    }
  });

  res.status(200).json({
    status: "success",
    message: "Report resolved",
  });
});

exports.rejectReport = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError("Unauthorized", 403);
  }

  const report = await Report.findById(req.params.id);

  if (!report) {
    throw new ApiError("Report not found", 404);
  }

  report.status = "rejected";
  await report.save();

  res.status(200).json({
    status: "success",
    message: "Report rejected",
  });
});