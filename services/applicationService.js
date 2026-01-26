const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Application = require("../models/applicationModel");
const Job = require("../models/jobModel");
const User = require("../models/userModel");
const WorkerProfile = require("../models/workerProfileModel");
const ApiError = require("../utils/apiError");
const penaltyService = require("../services/penaltyService");
const {
  sendNotificationNow,
  scheduleNotification
} = require("../services/notificationService");

const {sendEmail}= require("../utils/sendEmail");

/* =====================================================
   APPLY FOR JOB (Worker)
===================================================== */
// POST /jobs/:id/apply
exports.applyForJob = asyncHandler(async (req, res) => {
  const workerId = req.user._id;
  const jobId = req.params.id;

  if (req.user.role !== "worker") {
    throw new ApiError("Only workers can apply", 403);
  }

  if (
    req.user.discipline?.blockedUntil &&
    req.user.discipline.blockedUntil > new Date()
  ) {
    throw new ApiError("Your account is temporarily blocked", 403);
  }

  const job = await Job.findById(jobId).populate("employerId", "firstName lastName email fcmTokens");
  if (!job || job.status !== "open") {
    throw new ApiError("Job not available", 400);
  }

  if (job.acceptedWorkersCount >= job.requiredWorkers) {
    throw new ApiError("Job already filled", 400);
  }

  // منع التداخل في المواعيد
  const conflicts = await Application.find({
    workerId,
    status: "accepted",
  }).populate("jobId");

  for (const app of conflicts) {
    const cJob = app.jobId;
    if (
      new Date(job.startDateTime) < new Date(cJob.endDateTime) &&
      new Date(job.endDateTime) > new Date(cJob.startDateTime)
    ) {
      throw new ApiError("You already accepted a job at this time", 400);
    }
  }

  const existing = await Application.findOne({ jobId, workerId });
  if (existing) {
    throw new ApiError("You already applied for this job", 400);
  }

  const application = await Application.create({
    jobId,
    workerId,
  });

  // notify employer
  if (job.employerId.fcmTokens && job.employerId.fcmTokens.length > 0) {

      await sendNotificationNow({
        userId: job.employerId._id,
        type: "job_applied",
        title: "New Job Application",
        message: `${req.user.firstName} ${req.user.lastName} applied for your job "${job.title}".`,
        relatedJobId: job._id,
      });
  }else{

  // email notification
    await sendEmail({
      Email: job.employerId.email,
      subject: "عامل جديد قدم لوظيفتك",
      message: `تم التقديم لوظيفتك من قبل ${req.user.firstName} ${req.user.lastName}. يرجى تسجيل الدخول إلى حسابك لمراجعة الطلب.`,
    });
  }

  res.status(201).json({
    status: "success",
    data: application,
  });
});

/* =====================================================
   ACCEPT WORKER (Employer)
===================================================== */
// POST /jobs/:jobId/applications/:applicationId/accept
exports.acceptWorker = asyncHandler(async (req, res) => {
  const { jobId, applicationId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const job = await Job.findById(jobId).session(session);
    if (!job) throw new ApiError("Job not found", 404);

    if (!job.employerId.equals(req.user._id)) {
      throw new ApiError("Unauthorized", 403);
    }

    if (job.acceptedWorkersCount >= job.requiredWorkers) {
      throw new ApiError("Job already filled", 400);
    }

    const application = await Application.findById(applicationId).session(
      session
    ).populate("workerId", "fcmTokens email");

    if (!application || application.status !== "pending") {
      throw new ApiError("Invalid application", 400);
    }

    application.status = "accepted";
    application.acceptedByEmployerAt = new Date();
    application.employerAccepted = true;
    await application.save({ session });

    job.acceptedWorkersCount += 1;
    if (job.acceptedWorkersCount === job.requiredWorkers) {
      job.status = "filled";
    }

    await job.save({ session });
    await session.commitTransaction();

      // notify worker
      if (application.workerId.fcmTokens && application.workerId.fcmTokens.length > 0) {

        await sendNotificationNow({
          userId: application.workerId,
          type: "تم قبول طلبك للوظيفة",
          title: "تم قبول طلبك للوظيفة",
          message: `تم قبول طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
          relatedJobId: job._id,
        });
      }else{

      // email notification
        await sendEmail({
          Email: application.workerId.email,
          subject: "تم قبول طلبك للوظيفة",
          message: `تم قبول طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
        });
      }

      await notificationService.scheduleNotification({
      userId: application.workerId,
      type: "job_reminder_24h",
      title: "تذكير بالشغل",
      message: `بكرة عندك شغل ${job.title}`,
      relatedJobId: job._id,
      scheduledAt: new Date(
        new Date(job.startDateTime).getTime() - 24 * 60 * 60 * 1000
      ),
    });

    await notificationService.scheduleNotification({
      userId: application.workerId,
      type: "job_reminder_2h",
      title: "تذكير بالشغل",
      message: `فاض ساعتين على شغل ${job.title}`,
      relatedJobId: job._id,
      scheduledAt: new Date(
        new Date(job.startDateTime).getTime() - 2 * 60 * 60 * 1000
      ),
    });

    res.status(200).json({
      status: "success",
      message: "Worker accepted",
      data: application,
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/* =====================================================
   REJECT WORKER (Employer)
===================================================== */
// POST /jobs/:jobId/applications/:applicationId/reject
exports.rejectWorker = asyncHandler(async (req, res) => {
  const { jobId, applicationId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError("Job not found", 404);

  if (!job.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  const application = await Application.findById(applicationId).populate("workerId", "fcmTokens email");
  if (!application || application.status !== "pending") {
    throw new ApiError("Invalid application", 400);
  }

  application.status = "rejected";
  await application.save();

  // notify worker
  if (application.workerId.fcmTokens && application.workerId.fcmTokens.length > 0) {
      await sendNotificationNow({
        userId: application.workerId._id,
        type: "تم رفض طلبك للوظيفة",
        title: "تم رفض طلبك للوظيفة",
        message: `تم رفض طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
        relatedJobId: job._id,
      });
  }else{
  // email notification
    await sendEmail({
      Email: application.workerId.email,
      subject: "تم رفض طلبك للوظيفة",
      message: `تم رفض طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
    });
  }
  res.status(200).json({
    status: "success",
    message: "Worker rejected",
  });
});

/* =====================================================
   WITHDRAW APPLICATION (Worker)
===================================================== */
// PUT /applications/:id/withdraw
exports.withdrawApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    "jobId","employerId"
  );

  if (!application) throw new ApiError("Application not found", 404);

  if (!application.workerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (["cancelled", "rejected"].includes(application.status)) {
    throw new ApiError("Application already closed", 400);
  }

  // ممنوع الانسحاب بعد القبول
  if (application.status === "accepted") {
    throw new ApiError("You cannot withdraw after being accepted", 400);
  }

  const job = application.jobId;

  application.status = "cancelled";
  application.cancelledAt = new Date();
  application.cancelReason = "Withdrawn by worker";
  await application.save();

  await penaltyService.reportIncident({
    userId: req.user._id,
    jobId: job._id,
    type: "worker_cancelled",
    severity:
      new Date(job.startDateTime) - new Date() < 2 * 60 * 60 * 1000
        ? "high"
        : "medium",
  });

  const employer = await User.findById(job.employerId);

  // notify employer
  if (employer.fcmTokens && employer.fcmTokens.length > 0) {
      await sendNotificationNow({
        userId: employer._id,
        type: "انسحاب عامل من طلب وظيفتك",
        title:  "عامل انسحب من طلب وظيفتك",
        message: `قام ${req.user.firstName} ${req.user.lastName} بالانسحاب من طلب وظيفتك "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
        relatedJobId: job._id,
      });
  }else{
  // email notification
    await sendEmail({
      Email: employer.email,
      subject: "عامل انسحب من طلب وظيفتك",
      message: `قام ${req.user.firstName} ${req.user.lastName} بالانسحاب من طلب وظيفتك "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
    });
  }
  res.status(200).json({
    status: "success",
    message: "Application withdrawn",
  });
});

/* =====================================================
   MARK ARRIVAL (Worker)
===================================================== */
// POST /applications/:id/:id/mark-arrival
exports.markArrival = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    "jobId"
  );

  if (!application) throw new ApiError("Application not found", 404);

  if (!application.workerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  const job = application.jobId;

  if (job.status !== "in_progress") {
    throw new ApiError("Job has not started yet", 400);
  }

  if (application.arrivalStatus === "arrived") {
    throw new ApiError("Arrival already confirmed", 400);
  }

  application.arrivalStatus = "arrived";
  application.arrivedAt = new Date();
  await application.save();

  res.status(200).json({
    status: "success",
    message: "Arrival confirmed",
  });
});

/* =====================================================
   MARK NO-SHOW (Employer)
===================================================== */
// POST /applications/:id/mark-no-show
exports.markNoShow = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    "jobId"
  );

  if (!application) throw new ApiError("Application not found", 404);

  const job = application.jobId;

  if (!job.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  if (job.status !== "in_progress") {
    throw new ApiError("Job has not started yet", 400);
  }

  if (application.arrivalStatus === "no_show") {
    throw new ApiError("No-show already recorded", 400);
  }

  application.arrivalStatus = "no_show";
  application.status = "cancelled";
  application.noShowAt = new Date();
  await application.save();

  const worker = await User.findById(application.workerId);

  await penaltyService.reportIncident({
    userId: worker._id,
    jobId: job._id,
    type: "worker_no_show",
    severity: "high",
  });

  res.status(200).json({
    status: "success",
    message: "No-show recorded",
  });
});

/* =====================================================
   LIST APPLICATIONS FOR JOB (Employer)
===================================================== */
// GET applications/jobs/:id
exports.getApplicationsForJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw new ApiError("Job not found", 404);

  if (!job.employerId.equals(req.user._id)) {
    throw new ApiError("Unauthorized", 403);
  }

  const applications = await Application.find({ jobId: job._id })
    .populate("workerId", "firstName lastName city profileImage");

  const workerProfiles = await WorkerProfile.find({
    userId: { $in: applications.map((app) => app.workerId._id) },
  }).select("pastExperience experienceYears expectedHourlyRate");

  const applicationsWithProfiles = applications.map((app) => {
    const profile = workerProfiles.find((wp) =>
      wp.userId.equals(app.workerId._id)
    );

    return {
      ...app.toObject(),
      workerProfile: profile || null,
    };
  });

  res.status(200).json({
    status: "success",
    results: applicationsWithProfiles.length,
    data: applicationsWithProfiles,
  });
});

/* =====================================================
   GET MY APPLICATIONS (Worker)
===================================================== */
// GET /applications/my
exports.getMyApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ workerId: req.user._id })
    .populate(
      "jobId",
      "title employerId startDateTime endDateTime status details location"
    )
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: applications.length,
    data: applications,
  });
});
