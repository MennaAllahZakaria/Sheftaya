const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Application = require("../models/applicationModel");
const Job = require("../models/jobModel");
const User = require("../models/userModel");
const WorkerProfile = require("../models/workerProfileModel");
const IdentityVerification = require("../models/identityVerificationModel");
const ApiError = require("../utils/apiError");
const penaltyService = require("../services/penaltyService");
const {
  sendNotificationNow,
  scheduleNotification
} = require("../services/notificationService");

const {handleWorkerAcceptedNotifications , handleWorkerRejectedNotifications } = require("../utils/notificationHandler");

const {sendEmail}= require("../utils/sendEmail");

/* =====================================================
   APPLY FOR JOB (Worker)
===================================================== */
// POST /jobs/:id/apply
exports.applyForJob = asyncHandler(async (req, res) => {
  const workerId = req.user._id;
  const jobId = req.params.id;

  /* ================= VALIDATION ================= */

  if (req.user.role !== "worker") {
    throw new ApiError("Only workers can apply", 403);
  }

  const identityVerification = await IdentityVerification.findOne({
    userId: workerId,
  }).select("status");

  if (!identityVerification || identityVerification.status !== "approved") {
    throw new ApiError("Identity verification required", 403);
  }

  if (
    req.user.discipline?.blockedUntil &&
    req.user.discipline.blockedUntil > new Date()
  ) {
    throw new ApiError("Your account is temporarily blocked", 403);
  }

  /* ================= TRANSACTION ================= */

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= GET JOB ================= */

    const job = await Job.findOne({
      _id: jobId,
      status: "open",
    })
      .select(
        "startDateTime endDateTime requiredWorkers acceptedWorkersCount applicantsCount employerId title"
      )
      .populate("employerId", "firstName lastName email fcmTokens")
      .session(session);

    if (!job) {
      throw new ApiError("Job not available", 400);
    }

    if (job.acceptedWorkersCount >= job.requiredWorkers) {
      throw new ApiError("Job already filled", 400);
    }

    /* ================= DUPLICATE CHECK (SAFE) ================= */

    const existing = await Application.findOne({
      jobId,
      workerId,
    }).session(session);

    if (existing) {
      throw new ApiError("You already applied for this job", 400);
    }

    /* ================= TIME CONFLICT CHECK ================= */

    const conflicts = await Application.find({
      workerId,
      status: "accepted",
    })
      .select("jobId")
      .populate({
        path: "jobId",
        select: "startDateTime endDateTime",
      })
      .lean();

    const hasConflict = conflicts.some((app) => {
      const cJob = app.jobId;
      return (
        new Date(job.startDateTime) < new Date(cJob.endDateTime) &&
        new Date(job.endDateTime) > new Date(cJob.startDateTime)
      );
    });

    if (hasConflict) {
      throw new ApiError(
        "You already accepted a job at this time",
        400
      );
    }

    /* ================= CREATE APPLICATION ================= */

    const application = await Application.create(
      [
        {
          jobId,
          workerId,
          status: "pending",
        },
      ],
      { session }
    );

    /* ================= SAFE INCREMENT ================= */

    await Job.updateOne(
      { _id: jobId },
      { $inc: { applicantsCount: 1 } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    /* ================= NOTIFICATIONS (NON-BLOCKING) ================= */

    setImmediate(async () => {
      try {
        if (
          job.employerId?.fcmTokens &&
          job.employerId.fcmTokens.length > 0
        ) {
          await sendNotificationNow({
            userId: job.employerId._id,
            type: "new_application",
            title: "عامل جديد قدم لوظيفتك",
            message: `تم التقديم من ${req.user.firstName} ${req.user.lastName}`,
            relatedJobId: job._id,
          });
        } else if (job.employerId?.email) {
          await sendEmail({
            Email: job.employerId.email,
            subject: "عامل جديد قدم لوظيفتك",
            message: `تم التقديم من ${req.user.firstName} ${req.user.lastName}`,
          });
        }
      } catch (err) {
        console.error("Notification failed:", err.message);
      }
    });

    /* ================= RESPONSE ================= */

    res.status(201).json({
      status: "success",
      data: application[0],
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

/* =====================================================
   ACCEPT WORKER (Employer)
===================================================== */
// POST /jobs/:jobId/applications/:applicationId/accept
exports.acceptWorker = asyncHandler(async (req, res) => {
  const { jobId, applicationId } = req.params;
  const employerId = req.user._id;

  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= GET JOB (LOCK CONDITION) ================= */

    const job = await Job.findOne({
      _id: jobId,
      employerId,
      status: { $in: ["open", "filled"] },
    })
      .select(
        "requiredWorkers acceptedWorkersCount startDateTime endDateTime status title"
      )
      .session(session);

    if (!job) {
      throw new ApiError("Job not found or unauthorized", 404);
    }

    if (job.acceptedWorkersCount >= job.requiredWorkers) {
      throw new ApiError("Job already filled", 400);
    }

    /* ================= GET APPLICATION (STRICT) ================= */

    const application = await Application.findOne({
      _id: applicationId,
      jobId,
      status: "pending",
    })
      .populate("workerId", "fcmTokens email")
      .session(session);

    if (!application) {
      throw new ApiError("Invalid application", 400);
    }

    const workerId = application.workerId._id;

    /* ================= WORKER CONFLICT CHECK ================= */

    const conflicts = await Application.find({
      workerId,
      status: "accepted",
    })
      .populate({
        path: "jobId",
        select: "startDateTime endDateTime",
      })
      .lean();

    const hasConflict = conflicts.some((app) => {
      const cJob = app.jobId;
      return (
        new Date(job.startDateTime) < new Date(cJob.endDateTime) &&
        new Date(job.endDateTime) > new Date(cJob.startDateTime)
      );
    });

    if (hasConflict) {
      throw new ApiError("Worker already busy in this time", 400);
    }

    /* ================= UPDATE APPLICATION (ATOMIC) ================= */

    const updatedApp = await Application.findOneAndUpdate(
      {
        _id: applicationId,
        jobId,
        status: "pending",
      },
      {
        $set: {
          status: "accepted",
          acceptedByEmployerAt: new Date(),
          employerAccepted: true,
        },
      },
      { new: true, session }
    );

    if (!updatedApp) {
      throw new ApiError("Application already processed", 400);
    }

    /* ================= ATOMIC JOB UPDATE ================= */

    const updatedJob = await Job.findOneAndUpdate(
      {
        _id: jobId,
        acceptedWorkersCount: { $lt: job.requiredWorkers },
      },
      {
        $inc: { acceptedWorkersCount: 1 },
      },
      { new: true, session }
    );

    if (!updatedJob) {
      throw new ApiError("Job just got filled", 400);
    }

    /* ================= HANDLE FULL JOB ================= */

    if (updatedJob.acceptedWorkersCount === updatedJob.requiredWorkers) {
      await Job.updateOne(
        { _id: jobId },
        { $set: { status: "filled" } },
        { session }
      );

      // optional: auto-reject باقي applications
      await Application.updateMany(
        {
          jobId,
          status: "pending",
        },
        {
          $set: { status: "rejected" },
        },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    /* ================= NOTIFICATIONS (ASYNC) ================= */

    setImmediate(async () => {
      try {
        if (
          application.workerId?.fcmTokens &&
          application.workerId.fcmTokens.length > 0
        ) {
          await sendNotificationNow({
            userId: workerId,
            type: "job_accepted",
            title: "تم قبولك في الوظيفة",
            message: `تم قبولك في وظيفة "${job.title}"`,
            relatedJobId: job._id,
          });
        } else if (application.workerId?.email) {
          await sendEmail({
            Email: application.workerId.email,
            subject: "تم قبولك في الوظيفة",
            message: `تم قبولك في وظيفة "${job.title}"`,
          });
        }
      } catch (err) {
        console.error("Notification error:", err.message);
      }
    });

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "Worker accepted successfully",
      data: {
        applicationId: updatedApp._id,
        status: updatedApp.status,
        acceptedAt: updatedApp.acceptedByEmployerAt,
      },
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

/* =====================================================
   REJECT WORKER (Employer)
===================================================== */
// POST /jobs/:jobId/applications/:applicationId/reject
exports.rejectWorker = asyncHandler(async (req, res) => {
  const { jobId, applicationId } = req.params;
  const rejectReason = req.body.rejectReason || "No reason provided";
  const employerId = req.user._id;

  /* ================= GET JOB ================= */

  const job = await Job.findOne({
    _id: jobId,
    employerId,
    status: { $in: ["open", "filled"] },
  }).select("title");

  if (!job) {
    throw new ApiError("Job not found or unauthorized", 404);
  }

  /* ================= ATOMIC APPLICATION UPDATE ================= */

  const application = await Application.findOneAndUpdate(
    {
      _id: applicationId,
      jobId,
      status: "pending", // idempotency + safety
    },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectReason,
      },
    },
    {
      new: true,
    }
  ).populate("workerId", "fcmTokens email");

  if (!application) {
    throw new ApiError("Application not found or already processed", 400);
  }

  /* ================= RESPONSE ================= */

  res.status(200).json({
    status: "success",
    message: "Worker rejected successfully",
  });

  /* ================= NOTIFICATIONS (ASYNC SAFE) ================= */

  setImmediate(async () => {
    try {
      const worker = application.workerId;

      if (worker?.fcmTokens && worker.fcmTokens.length > 0) {
        await sendNotificationNow({
          userId: worker._id,
          type: "job_rejected",
          title: "تم رفض طلبك",
          message: `تم رفض طلبك لوظيفة "${job.title}"`,
          relatedJobId: jobId,
        });
      } else if (worker?.email) {
        await sendEmail({
          Email: worker.email,
          subject: "تم رفض طلبك",
          message: `تم رفض طلبك لوظيفة "${job.title}"`,
        });
      }
    } catch (err) {
      console.error("Reject notification error:", err.message);
    }
  });
});

/* =====================================================
   WITHDRAW APPLICATION (Worker)
===================================================== */
// PUT /applications/:id/withdraw
exports.withdrawApplication = asyncHandler(async (req, res) => {
  const applicationId = req.params.id;
  const workerId = req.user._id;

  /* ================= TRANSACTION ================= */

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= GET APPLICATION (STRICT + ATOMIC) ================= */

    const application = await Application.findOne({
      _id: applicationId,
      workerId,
      status: { $in: ["accepted" , "pending"] }, // idempotent
    })
      .populate({
        path: "jobId",
        select: "title startDateTime employerId status",
      })
      .session(session);

    if (!application) {
      throw new ApiError(
        "Application not found or cannot be withdrawn",
        400
      );
    }

    const job = application.jobId;

    /* ================= JOB STATUS CHECK ================= */

    if (["cancelled", "completed"].includes(job.status)) {
      throw new ApiError("Job is no longer active", 400);
    }

    /* ================= UPDATE APPLICATION ================= */

    application.status = "cancelled";
    application.cancelledAt = new Date();
    application.cancelReason = "Withdrawn by worker";

    await application.save({ session });

    /* ================= PENALTY ================= */

    const isLate =
      new Date(job.startDateTime) - new Date() <
      2 * 60 * 60 * 1000;

    await penaltyService.reportIncident({
      userId: workerId,
      jobId: job._id,
      type: "worker_cancelled",
      severity: isLate ? "high" : "medium",
    });

    await session.commitTransaction();
    session.endSession();

    /* ================= GET EMPLOYER ================= */

    const employer = await User.findById(job.employerId).select(
      "fcmTokens email"
    );

    /* ================= NOTIFICATIONS (ASYNC NON-BLOCKING) ================= */

    setImmediate(async () => {
      try {
        if (
          employer?.fcmTokens &&
          employer.fcmTokens.length > 0
        ) {
          await sendNotificationNow({
            userId: employer._id,
            type: "worker_withdrew",
            title: "عامل انسحب من طلبك",
            message: `قام ${req.user.firstName} ${req.user.lastName} بالانسحاب من طلب وظيفة "${job.title}"`,
            relatedJobId: job._id,
          });
        } else if (employer?.email) {
          await sendEmail({
            Email: employer.email,
            subject: "انسحاب عامل من الطلب",
            message: `قام ${req.user.firstName} ${req.user.lastName} بالانسحاب من طلب وظيفة "${job.title}"`,
          });
        }
      } catch (err) {
        console.error("Withdraw notification error:", err.message);
      }
    });

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "Application withdrawn successfully",
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

/* =====================================================
   MARK ARRIVAL (Worker)
===================================================== */
// POST /applications/:id/mark-arrival
exports.markArrival = asyncHandler(async (req, res) => {
  const applicationId = req.params.id;
  const workerId = req.user._id;
  const now = new Date();

  /* ================= ATOMIC FETCH + VALIDATION ================= */

  const application = await Application.findOne({
    _id: applicationId,
    workerId,
    status: "accepted", // مهم
    arrivalStatus: { $ne: "arrived" }, // idempotency
  })
    .populate({
      path: "jobId",
      select: "startDateTime endDateTime status title",
    });

  if (!application) {
    throw new ApiError(
      "Application not found or cannot mark arrival",
      400
    );
  }

  const job = application.jobId;

  /* ================= JOB STATUS ================= */

  if (job.status !== "in_progress") {
    throw new ApiError("Job has not started yet", 400);
  }

  /* ================= TIME WINDOW VALIDATION ================= */

  const start = new Date(job.startDateTime);
  const end = new Date(job.endDateTime);

  if (now < start) {
    throw new ApiError("Too early to mark arrival", 400);
  }

  if (now > end) {
    throw new ApiError("Job already ended", 400);
  }

  /* ================= UPDATE (ATOMIC) ================= */

  const updated = await Application.findOneAndUpdate(
    {
      _id: applicationId,
      workerId,
      status: "accepted",
      arrivalStatus: { $ne: "arrived" },
    },
    {
      $set: {
        arrivalStatus: "arrived",
        arrivedAt: now,
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new ApiError("Arrival already recorded", 400);
  }

  /* ================= RESPONSE ================= */

  res.status(200).json({
    status: "success",
    message: "Arrival confirmed",
    data: {
      applicationId: updated._id,
      arrivedAt: updated.arrivedAt,
    },
  });
});

/* =====================================================
   MARK NO-SHOW (Employer)
===================================================== */
// POST /applications/:id/mark-no-show
exports.markNoShow = asyncHandler(async (req, res) => {
  const applicationId = req.params.id;
  const employerId = req.user._id;
  const now = new Date();

  /* ================= TRANSACTION ================= */

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= GET APPLICATION ================= */

    const application = await Application.findOne({
      _id: applicationId,
      status: "accepted",
      arrivalStatus: { $ne: "arrived" }, // يمنع conflict
    })
      .populate({
        path: "jobId",
        select: "employerId startDateTime endDateTime status title",
      })
      .session(session);

    if (!application) {
      throw new ApiError(
        "Application not found or cannot be marked as no-show",
        400
      );
    }

    const job = application.jobId;

    /* ================= AUTHORIZATION ================= */

    if (!job.employerId.equals(employerId)) {
      throw new ApiError("Unauthorized", 403);
    }

    /* ================= JOB STATUS ================= */

    if (job.status !== "in_progress") {
      throw new ApiError("Job has not started yet", 400);
    }

    /* ================= TIME VALIDATION ================= */

    const start = new Date(job.startDateTime);
    const end = new Date(job.endDateTime);

    if (now < start) {
      throw new ApiError("Too early to mark no-show", 400);
    }

    if (now > end) {
      throw new ApiError("Job already ended", 400);
    }

    /* ================= UPDATE (ATOMIC) ================= */

    const updated = await Application.findOneAndUpdate(
      {
        _id: applicationId,
        status: "accepted",
        arrivalStatus: { $nin: ["arrived", "no_show"] },
      },
      {
        $set: {
          arrivalStatus: "no_show",
          status: "cancelled",
          noShowAt: now,
        },
      },
      { new: true, session }
    );

    if (!updated) {
      throw new ApiError("No-show already recorded", 400);
    }

    /* ================= PENALTY ================= */

    await penaltyService.reportIncident({
      userId: updated.workerId,
      jobId: job._id,
      type: "worker_no_show",
      severity: "high",
    });

    await session.commitTransaction();
    session.endSession();

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "No-show recorded successfully",
      data: {
        applicationId: updated._id,
        noShowAt: updated.noShowAt,
      },
    });

    /* ================= NOTIFICATIONS ================= */

    setImmediate(async () => {
      try {
        const worker = await User.findById(updated.workerId).select(
          "fcmTokens email"
        );

        if (worker?.fcmTokens && worker.fcmTokens.length > 0) {
          await sendNotificationNow({
            userId: worker._id,
            type: "no_show_recorded",
            title: "تم تسجيل غيابك",
            message: `تم تسجيلك كـ غائب في وظيفة "${job.title}"`,
            relatedJobId: job._id,
          });
        } else if (worker?.email) {
          await sendEmail({
            Email: worker.email,
            subject: "تم تسجيل غيابك",
            message: `تم تسجيلك كـ غائب في وظيفة "${job.title}"`,
          });
        }
      } catch (err) {
        console.error("No-show notification error:", err.message);
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

/* =====================================================
   LIST APPLICATIONS FOR JOB (Employer)
===================================================== */
// GET applications/jobs/:id
exports.getApplicationsForJob = asyncHandler(async (req, res) => {
  const jobId = req.params.id;
  const employerId = req.user._id;

  let { page = 1, limit = 10, status } = req.query;

  page = Math.max(1, parseInt(page));
  limit = Math.min(50, parseInt(limit));
  const skip = (page - 1) * limit;

  /* ================= GET JOB ================= */

  const job = await Job.findOne({
    _id: jobId,
    employerId,
  }).select("_id");

  if (!job) {
    throw new ApiError("Job not found or unauthorized", 404);
  }

  /* ================= FILTER ================= */

  const filter = { jobId };

  if (status) {
    filter.status = status; // pending / accepted / rejected
  }

  /* ================= GET APPLICATIONS ================= */

  const applications = await Application.find(filter)
    .select("status workerId createdAt arrivalStatus")
    .populate("workerId", "firstName lastName city profileImage")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  /* ================= GET WORKER PROFILES (OPTIMIZED) ================= */

  const workerIds = applications.map((app) => app.workerId._id);

  const profiles = await WorkerProfile.find({
    userId: { $in: workerIds },
  })
    .select("userId pastExperience experienceYears expectedHourlyRate")
    .lean();

  const profileMap = new Map(
    profiles.map((p) => [p.userId.toString(), p])
  );

  /* ================= MERGE ================= */

  const data = applications.map((app) => ({
    ...app,
    workerProfile: profileMap.get(app.workerId._id.toString()) || null,
  }));

  /* ================= COUNT ================= */

  const total = await Application.countDocuments(filter);

  /* ================= RESPONSE ================= */

  res.status(200).json({
    status: "success",
    page,
    results: data.length,
    totalResults: total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
    data,
  });
});

/* =====================================================
   GET MY APPLICATIONS (Worker)
===================================================== */
// GET /applications/my
exports.getMyApplications = asyncHandler(async (req, res) => {
  const workerId = req.user._id;

  let { page = 1, limit = 10, status } = req.query;

  page = Math.max(1, parseInt(page));
  limit = Math.min(50, parseInt(limit));
  const skip = (page - 1) * limit;

  const matchStage = {
    workerId: new mongoose.Types.ObjectId(workerId),
  };

  if (status) {
    matchStage.status = status;
  }

  const now = new Date();

  const pipeline = [
    { $match: matchStage },

    /* ================= JOB ================= */
    {
      $lookup: {
        from: "jobs",
        localField: "jobId",
        foreignField: "_id",
        as: "job",
      },
    },
    { $unwind: "$job" },

    /* ================= REPORT ================= */
    {
      $lookup: {
        from: "reports",
        localField: "_id",
        foreignField: "applicationId",
        as: "report",
      },
    },
    {
      $unwind: {
        path: "$report",
        preserveNullAndEmptyArrays: true,
      },
    },

    /* ================= DERIVED ================= */
    {
      $addFields: {
        /* ===== BASIC ===== */
        isUpcoming: { $gt: ["$job.startDateTime", now] },

        isCompleted: { $eq: ["$job.status", "completed"] },

        isActive: {
          $and: [
            { $eq: ["$status", "accepted"] },
            { $eq: ["$job.status", "in_progress"] },
          ],
        },

        /* ===== LATE ===== */
        isLate: {
          $and: [
            { $eq: ["$arrivalStatus", "not_arrived"] },
            {
              $gt: [
                now,
                {
                  $add: ["$job.startDateTime", 15 * 60 * 1000],
                },
              ],
            },
          ],
        },

        /* ===== WITHDRAW ===== */
        canWithdraw: {
          $and: [
            { $in: ["$status", ["pending", "accepted"]] },
            { $gt: ["$job.startDateTime", now] },
          ],
        },

        /* ===== CHECK-IN ===== */
        canCheckIn: {
          $and: [
            { $eq: ["$status", "accepted"] },
            { $ne: ["$arrivalStatus", "arrived"] },
            { $eq: ["$job.status", "in_progress"] },
            { $lte: ["$job.startDateTime", now] },
            { $gte: ["$job.endDateTime", now] },
          ],
        },

        /* ===== PROGRESS ===== */
        progressPercentage: {
          $cond: [
            { $lte: ["$job.startDateTime", now] },
            {
              $min: [
                100,
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: [now, "$job.startDateTime"] },
                        {
                          $subtract: [
                            "$job.endDateTime",
                            "$job.startDateTime",
                          ],
                        },
                      ],
                    },
                    100,
                  ],
                },
              ],
            },
            0,
          ],
        },

        /* ===== DISPLAY STATUS ===== */
        displayStatus: {
          $switch: {
            branches: [
              /* rejected */
              {
                case: { $eq: ["$status", "rejected"] },
                then: "rejected",
              },

              /* report under review */
              {
                case: { $eq: ["$report.status", "under_review"] },
                then: "reportUnderReview",
              },

              /* report resolved */
              {
                case: { $eq: ["$report.status", "resolved"] },
                then: "reportResolved",
              },

              /* completed */
              {
                case: { $eq: ["$job.status", "completed"] },
                then: "completed",
              },

              /* active */
              {
                case: {
                  $and: [
                    { $eq: ["$status", "accepted"] },
                    { $eq: ["$job.status", "in_progress"] },
                  ],
                },
                then: "active",
              },

              /* accepted */
              {
                case: {
                  $and: [
                    { $eq: ["$status", "accepted"] },
                    { $gt: ["$job.startDateTime", now] },
                  ],
                },
                then: "accepted",
              },
            ],
            default: "$status",
          },
        },
      },
    },

    /* ================= PROJECTION ================= */
    {
      $project: {
        status: 1,
        arrivalStatus: 1,
        createdAt: 1,

        isUpcoming: 1,
        isCompleted: 1,
        isActive: 1,
        isLate: 1,
        canWithdraw: 1,
        canCheckIn: 1,
        displayStatus: 1,

        progressPercentage: {
          $round: ["$progressPercentage", 0],
        },

        job: {
          _id: "$job._id",
          title: "$job.title",
          startDateTime: "$job.startDateTime",
          endDateTime: "$job.endDateTime",
          status: "$job.status",
          location: "$job.location",
        },
      },
    },

    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [data, total] = await Promise.all([
    Application.aggregate(pipeline),
    Application.countDocuments(matchStage),
  ]);

  res.status(200).json({
    status: "success",
    page,
    results: data.length,
    totalResults: total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
    data,
  });
});