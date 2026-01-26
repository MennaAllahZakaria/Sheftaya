const asyncHandler = require("express-async-handler");

const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const ApiError = require("../utils/apiError");
const penaltyService = require("../services/penaltyService");

/* =====================================================
   CREATE JOB (Draft)
===================================================== */

exports.createJob = asyncHandler(async (req, res) => {
  const employerId = req.user._id;

  if (req.user.role !== "employer") {
    throw new ApiError("Only employers can create jobs", 403);
  }

  if (
    req.user.discipline?.blockedUntil &&
    req.user.discipline.blockedUntil > new Date()
  ) {
    throw new ApiError("Your account is temporarily blocked", 403);
  }

  const {
    title,
    place,
    location,
    startDateTime,
    endDateTime,
    dailyWorkHours,
    requiredWorkers,
    pricePerHour,
    experienceLevel,
    details,
    paymentMethod
  } = req.body;

  if (!title || !place || !location || !startDateTime || !endDateTime) {
    throw new ApiError("Missing required job fields", 400);
  }

  if (new Date(startDateTime) <= new Date()) {
    throw new ApiError("Start time must be in the future", 400);
  }

  if (
    !Number.isFinite(dailyWorkHours) ||
    !Number.isFinite(requiredWorkers) ||
    !pricePerHour?.amount ||
    !Number.isFinite(pricePerHour.amount)
  ) {
    throw new ApiError("Invalid pricing or hours data", 400);
  }

  const totalAmount =
    dailyWorkHours * requiredWorkers * pricePerHour.amount;

  const job = await Job.create({
    employerId,
    title,
    place,
    location,
    startDateTime,
    endDateTime,
    dailyWorkHours,
    requiredWorkers,
    pricePerHour,
    experienceLevel,
    details,
    status: "draft",
    payment: {
      method: paymentMethod,
      status: "pending",
      totalAmount
    },
    cancellationPolicy: {
      freeCancelUntil: new Date(
        new Date(startDateTime).getTime() - 24 * 60 * 60 * 1000
      ),
      penaltyAfter: new Date(
        new Date(startDateTime).getTime() - 2 * 60 * 60 * 1000
      )
    }
  });

  res.status(201).json({
    status: "success",
    data: job
  });
});

/* =====================================================
   ACTIVATE JOB AFTER PAYMENT
===================================================== */

exports.activateJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) throw new ApiError("Job not found", 404);

  if (!job.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (job.status !== "draft") {
    throw new ApiError("Job already activated or invalid state", 400);
  }

  if (job.payment.status !== "paid_intent_created") {
    throw new ApiError("Payment not completed", 400);
  }

  job.payment.status = "held";
  job.status = "open";

  await job.save();

  res.status(200).json({
    status: "success",
    message: "Job activated and open for applications",
    data: job
  });
});

/* =====================================================
   LIST OPEN JOBS (Workers)
===================================================== */

exports.getOpenJobs = asyncHandler(async (req, res) => {
  const { city, dateFrom, dateTo, experienceLevel } = req.query;

  const filter = { status: "open" };

  if (city) filter["location.city"] = city;
  if (experienceLevel) filter.experienceLevel = experienceLevel;

  if (dateFrom || dateTo) {
    filter.startDateTime = {};
    if (dateFrom) filter.startDateTime.$gte = new Date(dateFrom);
    if (dateTo) filter.startDateTime.$lte = new Date(dateTo);
  }

  const jobs = await Job.find(filter).sort({ startDateTime: 1 });

  res.status(200).json({
    status: "success",
    results: jobs.length,
    data: jobs
  });
});

/* =====================================================
   GET JOB DETAILS
===================================================== */

exports.getJobDetails = asyncHandler(async (req, res) => {
  const jobId = req.params.id;

  const job = await Job.findById(jobId)
    .populate("employerId", "firstName lastName");

  if (!job) throw new ApiError("Job not found", 404);

  let applications = null;
  let myApplication = null;

  if (req.user.role === "employer" &&
      job.employerId._id.equals(req.user._id)) {
    applications = await Application.find({ jobId: job._id })
      .populate("workerId", "firstName lastName city profileImage");
  }

  if (req.user.role === "worker") {
    myApplication = await Application.findOne({
      jobId: job._id,
      workerId: req.user._id
    });
  }

  res.status(200).json({
    status: "success",
    data: { job, applications, myApplication }
  });
});

/* =====================================================
   GET MY JOBS (Employer & Worker)
===================================================== */

exports.getMyJobs = asyncHandler(async (req, res) => {
  let jobs = [];

  if (req.user.role === "employer") {
    jobs = await Job.find({ employerId: req.user._id })
      .sort({ startDateTime: -1 });
  }

  if (req.user.role === "worker") {
    const applications = await Application.find({
      workerId: req.user._id
    }).populate("jobId");

    jobs = applications.map(app => ({
      job: app.jobId,
      applicationStatus: app.status,
      arrivalStatus: app.arrivalStatus
    }));
  }

  res.status(200).json({
    status: "success",
    results: jobs.length,
    data: jobs
  });
});

/* =====================================================
   UPDATE JOB (Employer)
===================================================== */

exports.updateJob = asyncHandler(async (req, res) => {
  const jobId = req.params.id;

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError("Job not found", 404);

  if (!job.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (["in_progress", "completed", "cancelled"].includes(job.status)) {
    throw new ApiError("Job cannot be updated in its current state", 400);
  }

  if (job.acceptedWorkersCount > 0) {
    throw new ApiError("Job cannot be updated after accepting workers", 400);
  }

  const now = new Date();
  if (new Date(job.startDateTime) - now < 24 * 60 * 60 * 1000) {
    throw new ApiError("Job cannot be updated less than 24 hours before start", 400);
  }

  const allowedFields = [
    "title",
    "place",
    "location",
    "startDateTime",
    "endDateTime",
    "dailyWorkHours",
    "requiredWorkers",
    "experienceLevel",
    "details"
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      job[field] = req.body[field];
    }
  });

  if (
    req.body.requiredWorkers ||
    req.body.dailyWorkHours ||
    req.body.pricePerHour
  ) {
    const price = req.body.pricePerHour || job.pricePerHour;
    const hours = req.body.dailyWorkHours || job.dailyWorkHours;
    const workers = req.body.requiredWorkers || job.requiredWorkers;

    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(workers) ||
      !price?.amount ||
      !Number.isFinite(price.amount)
    ) {
      throw new ApiError("Invalid updated pricing or hours data", 400);
    }

    job.pricePerHour = price;
    job.dailyWorkHours = hours;
    job.requiredWorkers = workers;
    job.payment.totalAmount = price.amount * hours * workers;
  }

  await job.save();

  res.status(200).json({
    status: "success",
    message: "Job updated successfully",
    data: job
  });
});

/* =====================================================
   CANCEL JOB (Employer)
===================================================== */

exports.cancelJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) throw new ApiError("Job not found", 404);

  if (!job.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (["completed", "cancelled"].includes(job.status)) {
    throw new ApiError("Job already finished or cancelled", 400);
  }

  job.status = "cancelled";
  job.cancelReason = req.body.reason || "Cancelled by employer";

  if (job.payment.status === "held") {
    job.payment.status = "refunded";
  }

  await penaltyService.reportIncident({
    userId: job.employerId,
    jobId: job._id,
    type: "employer_cancelled",
    severity:
      new Date(job.startDateTime) - new Date() < 24 * 60 * 60 * 1000
        ? "high"
        : "medium",
  });

  await job.save();

  res.status(200).json({
    status: "success",
    message: "Job cancelled",
    data: job
  });
});

/* =====================================================
   CONFIRM JOB COMPLETION
===================================================== */

exports.confirmCompletion = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) throw new ApiError("Job not found", 404);

  if (new Date() < new Date(job.endDateTime)) {
    throw new ApiError("Job has not ended yet", 400);
  }

  const isEmployer = job.employerId.equals(req.user._id);

  const application = await Application.findOne({
    jobId: job._id,
    workerId: req.user._id
  });

  if (!isEmployer && !application) {
    throw new ApiError("Unauthorized", 403);
  }

  if (isEmployer) {
    job.confirmation.employerConfirmed = true;
  } else {
    application.workerConfirmedCompletion = true;
    await application.save();
    job.confirmation.workersConfirmedCount += 1;
  }

  if (
    job.confirmation.employerConfirmed &&
    job.confirmation.workersConfirmedCount >= job.requiredWorkers
  ) {
    job.status = "completed";
    job.payment.status = "paid";
  }

  await job.save();

  res.status(200).json({
    status: "success",
    message: "Completion confirmed",
    data: job
  });
});
