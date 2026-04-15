const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const IdentityVerification = require("../models/identityVerificationModel");
const WorkerProfile = require("../models/workerProfileModel");
const EmployerProfile = require("../models/employerProfileModel");
const ApiError = require("../utils/apiError");
const penaltyService = require("../services/penaltyService");
const Report = require("../models/reportModel");
const {
  sendNotificationNow,
  scheduleNotification
} = require("../services/notificationService");

const sendEmail = require("../utils/sendEmail");
/* =====================================================
   CREATE JOB (Draft)
===================================================== */

exports.createJob = asyncHandler(async (req, res) => {
  const employerId = req.user._id;
  const files = { ...(req.uploadedFiles || {}) };

  /* ================= AUTH ================= */

  if (req.user.role !== "employer") {
    throw new ApiError("Only employers can create jobs", 403);
  }

  const identityVerification = await IdentityVerification.findOne({
    userId: employerId,
  }).select("status");

  if (!identityVerification || identityVerification.status !== "approved") {
    throw new ApiError("Identity verification required to create jobs", 403);
  }

  if (
    req.user.discipline?.blockedUntil &&
    req.user.discipline.blockedUntil > new Date()
  ) {
    throw new ApiError("Your account is temporarily blocked", 403);
  }

  /* ================= INPUT ================= */

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
    paymentMethod,
    requiredSkills,
    companyDetails,
    jobPostedAs = "company", //  default
  } = req.body;

  /* ================= VALIDATION ================= */

  if (!title || !place || !location || !startDateTime || !endDateTime) {
    throw new ApiError("Missing required job fields", 400);
  }

  if (new Date(startDateTime) <= new Date()) {
    throw new ApiError("Start time must be in the future", 400);
  }

  if (new Date(endDateTime) <= new Date(startDateTime)) {
    throw new ApiError("End time must be after start time", 400);
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

  if (totalAmount <= 0) {
    throw new ApiError("Total job cost must be greater than zero", 400);
  }

  /* ================= COMPANY LOGIC ================= */

  const employerProfile = await EmployerProfile.findOne({
    userId: employerId,
  }).lean();

  let finalCompanyDetails;

  if (jobPostedAs === "company") {
    if (!employerProfile) {
      throw new ApiError("Employer profile not found", 404);
    }

    finalCompanyDetails = {
      companyName: employerProfile.companyName,
      companyType: employerProfile.companyType,
      companyAddress: employerProfile.companyAddress,
      companyCity: employerProfile.city,
      companyTaxNumber: employerProfile.taxNumber,
      companyCommercialRegisterNumber:
        employerProfile.commercialRegisterNumber,
      companyContactPersonName: employerProfile.contactPersonName,
      companyImages: employerProfile.companyImages || [],
    };
  } else if (jobPostedAs === "mediator") {
    if (!companyDetails || !companyDetails.companyName) {
      throw new ApiError("Mediator company details required", 400);
    }

    finalCompanyDetails = {
      companyName: companyDetails.companyName,
      companyType: companyDetails.companyType,
      companyAddress: companyDetails.companyAddress,
      companyCity: companyDetails.companyCity,
      companyContactPersonName:
        companyDetails.companyContactPersonName,

      companyImages: files?.companyImages || [],
    };
  } else {
    throw new ApiError("Invalid jobPostedAs value", 400);
  }

  /* ================= CREATE JOB ================= */

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
    requiredSkills,
    JobImages: files?.JobImages,

    jobPostedAs,
    companyDetails: finalCompanyDetails,

    status: "active",

    payment: {
      method: paymentMethod,
      status: "pending",
      totalAmount,
    },

    cancellationPolicy: {
      freeCancelUntil: new Date(
        new Date(startDateTime).getTime() - 24 * 60 * 60 * 1000
      ),
      penaltyAfter: new Date(
        new Date(startDateTime).getTime() - 2 * 60 * 60 * 1000
      ),
    },
  });

  /* ================= RESPONSE ================= */

  res.status(201).json({
    status: "success",
    data: job,
  });
});


/* =====================================================
   LIST active JOBS (Workers)
===================================================== */

exports.getActiveJobs = asyncHandler(async (req, res) => {
  let {
    page = 1,
    limit = 10,
    sort = "startDateTime",
    city,
    experienceLevel,
    minPrice,
    maxPrice,
    dateFrom,
    dateTo,
    lat,
    lng,
    radius = 5000, // بالمتر
  } = req.query;

  /* ================= SANITIZE ================= */

  page = Math.max(1, parseInt(page));
  limit = Math.min(50, parseInt(limit));

  const skip = (page - 1) * limit;

  /* ================= FILTER ================= */

  const filter = { status: "active" };

  // city search (fallback لو مفيش geo)
  if (city) {
    filter["location.address"] = { $regex: city, $options: "i" };
  }

  // experience
  if (experienceLevel) {
    filter.experienceLevel = experienceLevel;
  }

  // price
  if (minPrice || maxPrice) {
    filter["pricePerHour.amount"] = {};
    if (minPrice) filter["pricePerHour.amount"].$gte = Number(minPrice);
    if (maxPrice) filter["pricePerHour.amount"].$lte = Number(maxPrice);
  }

  // date
  if (dateFrom || dateTo) {
    filter.startDateTime = {};
    if (dateFrom) filter.startDateTime.$gte = new Date(dateFrom);
    if (dateTo) filter.startDateTime.$lte = new Date(dateTo);
  }

  //  GEO FILTER 
  if (lat && lng) {
    filter.location = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [parseFloat(lng), parseFloat(lat)],
        },
        $maxDistance: parseInt(radius),
      },
    };
  }

  /* ================= SORT ================= */

  const allowedSortFields = [
    "startDateTime",
    "-startDateTime",
    "pricePerHour.amount",
    "-pricePerHour.amount",
  ];

  if (!allowedSortFields.includes(sort)) {
    sort = "startDateTime";
  }

  /* ================= QUERY ================= */

  const jobsQuery = Job.find(filter)
    .select(
      "title place location startDateTime dailyWorkHours pricePerHour requiredWorkers acceptedWorkersCount experienceLevel status requiredSkills JobImages companyDetails"
    )
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const [jobs, total] = await Promise.all([
    jobsQuery,
    Job.countDocuments(filter),
  ]);

  /* ================= RESPONSE ================= */

  res.status(200).json({
    status: "success",
    page,
    results: jobs.length,
    totalResults: total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
    data: jobs,
  });
});

/* =====================================================
   GET JOB DETAILS
===================================================== */

exports.getJobDetails = asyncHandler(async (req, res) => {
  const jobId = req.params.id;
  const userId = req.user._id;
  const userRole = req.user.role;

  /* ================= GET JOB ================= */

  const job = await Job.findById(jobId)
    .select(`
      title
      details
      place
      location
      startDateTime
      endDateTime
      dailyWorkHours
      pricePerHour
      requiredWorkers
      acceptedWorkersCount
      experienceLevel
      status
      requiredSkills
      JobImages
      employerId
      companyDetails
    `)
    .populate("employerId", "firstName lastName rating ratingAverage imageProfile")
    .lean();

  if (!job) {
    throw new ApiError("Job not found", 404);
  }

  /* ================= ACCESS CONTROL ================= */

  const isOwner =
    job.employerId &&
    job.employerId._id.toString() === userId.toString();

  const allowedStatuses = ["active", "completed"];

  if (!isOwner && !allowedStatuses.includes(job.status)) {
    throw new ApiError("You are not allowed to view this job", 403);
  }

  /* ================= DERIVED DATA ================= */

  const isFull = job.acceptedWorkersCount >= job.requiredWorkers;

  let applications;
  let myApplication;

  /* ================= EMPLOYER ================= */

  if (userRole === "employer" && isOwner) {
    applications = await Application.find({
      jobId: job._id,
      status: { $in: ["pending", "accepted"] },
    })
      .select("status createdAt workerId")
      .populate(
        "workerId",
        "firstName lastName city imageProfile rating ratingAverage"
      )
      .sort({ createdAt: -1 })
      .lean();
  }

  /* ================= WORKER ================= */

  if (userRole === "worker") {
    myApplication = await Application.findOne({
      jobId: job._id,
      workerId: userId,
    })
      .select("status createdAt")
      .lean();
  }

  /* ================= RESPONSE ================= */

  res.status(200).json({
    status: "success",
    data: {
      job,
      isFull,
      isOwner,

      ...(applications && { applications }),
      ...(myApplication && { myApplication }),
    },
  });
});

/* =====================================================
   GET MY JOBS (Employer & Worker)
===================================================== */

const resolveJobStatus = (job, app = null) => {
  if (!job) return null;

  // ================= JOB LEVEL =================
  if (job.status === "completed") return "completed";
  if (job.status === "reportUnderReview") return "report_under_review";
  if (job.status === "reportResolved") return "report_resolved";

  // ================= WORKER LEVEL =================
  if (app) {
    if (app.status === "accepted") return "accepted";
    if (app.status === "rejected") return "rejected";
    return "pending";
  }

  // ================= EMPLOYER VIEW =================
  if (job.acceptedWorkersCount > 0) {
    return job.payment?.status === "paid"
      ? "workers_selected_paid"
      : "workers_selected_unpaid";
  }

  return "no_workers_selected";
};


exports.getMyJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const role = req.user.role;

  let data = [];

  /* ================= EMPLOYER ================= */

  if (role === "employer") {
    const jobs = await Job.find({ employerId: userId })
      .select(`
        title
        details
        place
        createdAt
        startDateTime
        dailyWorkHours
        location
        pricePerHour
        status
        requiredWorkers
        acceptedWorkersCount
        JobImages
        companyDetails
        payment
      `)
      .sort({ startDateTime: -1 })
      .lean();

    data = jobs.map(job => {
      const finalStatus = resolveJobStatus(job);

      return {
        title: job.title,
        place: job.place || job.location?.mainPlace,
        postedAt: job.createdAt,

        finalStatus, // unified status
        jobStatus: job.status,
        job,
        applicationStatus: null,
        arrivalStatus: null,
        appliedAt: null
      };
    });
  }

  /* ================= WORKER ================= */

  if (role === "worker") {
    const applications = await Application.find({
      workerId: userId,
      status: { $ne: "rejected" }
    })
      .select("status arrivalStatus jobId createdAt employerAccepted employerAcceptedAt")
      .populate("jobId", `
        title
        details
        place
        createdAt
        startDateTime
        dailyWorkHours
        location
        pricePerHour
        status
        JobImages
        companyDetails
        acceptedWorkersCount
        payment
      `)
      .sort({ createdAt: -1 })
      .lean();

    data = applications.map(app => {
      const job = app.jobId;
      const finalStatus = resolveJobStatus(job, app);

      return {
        title: job?.title,
        place: job?.place || job?.location?.mainPlace,
        postedAt: job?.createdAt,
        appliedAt: app.createdAt,

        finalStatus,

        job,
        applicationStatus: app.status,
        arrivalStatus: app.arrivalStatus
      };
    });
  }

  res.status(200).json({
    status: "success",
    results: data.length,
    data
  });
});

/* =====================================================
   UPDATE JOB (Employer)
===================================================== */
exports.updateJob = asyncHandler(async (req, res) => {
  const jobId = req.params.id;

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError("Job not found", 404);

  /* ================= AUTH ================= */

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

  /* ================= UPDATE BASIC FIELDS ================= */

  const allowedFields = [
    "title",
    "place",
    "location",
    "startDateTime",
    "endDateTime",
    "requiredWorkers",
    "experienceLevel",
    "details"
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      job[field] = req.body[field];
    }
  });

  /* ================= TIME LOGIC ================= */

  let start = new Date(job.startDateTime);
  let end = new Date(job.endDateTime);

  
  if (req.body.startDateTime || req.body.endDateTime) {
    if (end <= start) {
      throw new ApiError("End time must be after start time", 400);
    }

    const hours = (end - start) / (1000 * 60 * 60);

    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      throw new ApiError("Invalid working hours", 400);
    }

    job.dailyWorkHours = hours;
  }

  /* ================= PRICE & PAYMENT ================= */

  if (
    req.body.requiredWorkers ||
    req.body.pricePerHour ||
    req.body.startDateTime ||
    req.body.endDateTime
  ) {
    const price = req.body.pricePerHour || job.pricePerHour;
    const hours = job.dailyWorkHours;
    const workers = req.body.requiredWorkers || job.requiredWorkers;

    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(workers) ||
      !price?.amount ||
      !Number.isFinite(price.amount)
    ) {
      throw new ApiError("Invalid pricing or hours data", 400);
    }

    job.pricePerHour = price;
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
  const jobId = req.params.id;
  const userId = req.user._id;
  const reason = req.body.reason || "Cancelled by employer";


  /* ================= TRANSACTION ================= */

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= ATOMIC UPDATE ================= */

    const job = await Job.findOneAndUpdate(
      {
        _id: jobId,
        employerId: userId,
        status: { $nin: ["completed", "cancelled"] }
      },
      {
        $set: {
          status: "cancelled",
          cancelReason: reason
        }
      },
      { new: true, session }
    );

    if (!job) {
      throw new ApiError("Job not found or unauthorized", 404);
    }

    /* ================= PAYMENT HANDLING ================= */

    if (job.payment?.status === "held") {
      job.payment.status = "refunded";
      await job.save({ session });
    }

    /* ================= PENALTY ================= */

    const isLateCancel =
      new Date(job.startDateTime) - new Date() < 24 * 60 * 60 * 1000;

    await penaltyService.reportIncident({
      userId: job.employerId,
      jobId: job._id,
      type: "employer_cancelled",
      severity: isLateCancel ? "high" : "medium",
    });

    /* ================= GET WORKERS ================= */

    const applications = await Application.find({
      jobId: job._id,
      status: "accepted"
    })
      .select("workerId")
      .populate("workerId", "fcmTokens email")
      .lean()
      .session(session);

    await session.commitTransaction();
    session.endSession();

    /* ================= NOTIFICATIONS (OUTSIDE TX) ================= */

    await Promise.all(
      applications.map(async (app) => {
        try {
          if (
            app.workerId?.fcmTokens &&
            app.workerId.fcmTokens.length > 0
          ) {
            return sendNotificationNow({
              userId: app.workerId._id,
              type: "job_cancelled",
              title: "تم إلغاء الوظيفة",
              message: `تم إلغاء الوظيفة "${job.title}" التي تم قبولك لها.`,
              relatedJobId: job._id,
            });
          } else if (app.workerId?.email) {
            return sendEmail({
              Email: app.workerId.email,
              subject: "تم إلغاء الوظيفة",
              message: `تم إلغاء الوظيفة "${job.title}" التي تم قبولك لها.`,
            });
          }
        } catch (err) {
          console.error("Notification failed:", err.message);
        }
      })
    );

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "Job cancelled successfully",
      data: {
        _id: job._id,
        status: job.status,
        cancelReason: job.cancelReason,
        paymentStatus: job.payment?.status
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

/* =====================================================
   CONFIRM JOB COMPLETION
===================================================== */

exports.confirmCompletion = asyncHandler(async (req, res) => {
  const jobId = req.params.id;
  const userId = req.user._id;


  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= GET JOB ================= */

    const job = await Job.findById(jobId).session(session);

    if (!job) {
      throw new ApiError("Job not found", 404);
    }

    /* ================= STATUS CHECK ================= */

    if (["cancelled", "completed"].includes(job.status)) {
      throw new ApiError("Job is not eligible for confirmation", 400);
    }

    if (new Date() < new Date(job.endDateTime)) {
      throw new ApiError("Job has not ended yet", 400);
    }

    const isEmployer = job.employerId.equals(userId);

    /* ================= WORKER CHECK ================= */

    let application = null;

    if (!isEmployer) {
      application = await Application.findOne({
        jobId: job._id,
        workerId: userId,
        status: "accepted"
      }).session(session);

      if (!application) {
        throw new ApiError("Unauthorized", 403);
      }
    }

    /* ================= EMPLOYER CONFIRM ================= */

    if (isEmployer) {
      if (!job.confirmation.employerConfirmed) {
        job.confirmation.employerConfirmed = true;
      }
    }

    /* ================= WORKER CONFIRM ================= */

    if (!isEmployer) {
      if (!application.workerConfirmedCompletion) {
        application.workerConfirmedCompletion = true;
        await application.save({ session });

        await Job.updateOne(
          { _id: job._id },
          { $inc: { "confirmation.workersConfirmedCount": 1 } },
          { session }
        );
      }
    }

    /* ================= REFRESH JOB ================= */

    const updatedJob = await Job.findById(job._id).session(session);

    /* ================= FINAL COMPLETION ================= */

    if (
      updatedJob.confirmation.employerConfirmed &&
      updatedJob.confirmation.workersConfirmedCount >=
        updatedJob.requiredWorkers
    ) {
      updatedJob.status = "completed";

      if (updatedJob.payment?.status !== "paid") {
        updatedJob.payment.status = "paid";
      }
    }

    await updatedJob.save({ session });

    await session.commitTransaction();
    session.endSession();

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "Completion confirmed",
      data: {
        _id: updatedJob._id,
        status: updatedJob.status,
        confirmation: updatedJob.confirmation,
        paymentStatus: updatedJob.payment?.status
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});


const axios = require("axios");

 const getRecommendations = async (worker, jobs) => {
  try {
    const response = await axios.post(
      "https://recommendation-system-shiftaya-production.up.railway.app/recommend",
      {
        worker,
        jobs,
      },
      {
        headers: {
          "x-api-key": process.env.AI_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 5000, 
      }
    );

    return response.data;
  } catch (error) {
    console.error("AI ERROR:", error.response?.data || error.message);
    throw new Error("Recommendation service failed");
  }
};

exports.getRecommendedJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  /* ================= WORKER ================= */

  const worker = await WorkerProfile.findOne({ userId }).lean();

  if (!worker) {
    throw new ApiError("Worker profile not found", 404);
  }

  /* ================= JOBS ================= */

  const jobs = await Job.find({ status: "active" })
    .select(`
      title
      pricePerHour
      experienceLevel
      location
      details
      requiredSkills
      dailyWorkHours
      startDateTime
      requiredWorkers
      companyDetails
    `)
    .lean();

  if (!jobs.length) {
    return res.status(200).json({
      status: "success",
      results: 0,
      data: [],
    });
  }

  /* ================= SCORING FUNCTION ================= */

  const scoreJob = (job, worker) => {
    let score = 0;

    // 1. skills match
    if (worker.skills?.length && job.requiredSkills?.length) {
      const matches = job.requiredSkills.filter(skill =>
        worker.skills.includes(skill)
      );
      score += matches.length * 5;
    }

    // 2. experience match
    if (worker.experienceLevel === job.experienceLevel) {
      score += 10;
    }

    // 3. price preference (expected rate)
    if (worker.expectedSalary && job.pricePerHour?.amount) {
      const diff = Math.abs(
        worker.expectedSalary - job.pricePerHour.amount
      );
      score += Math.max(0, 10 - diff);
    }

    // 4. availability (basic)
    if (worker.availableDays?.length) {
      const jobDay = new Date(job.startDateTime).getDay();
      if (worker.availableDays.includes(jobDay)) {
        score += 5;
      }
    }

    return score;
  };

  /* ================= RANKING ================= */

  let rankedJobs = jobs
    .map(job => ({
      ...job,
      score: scoreJob(job, worker),
    }))
    .sort((a, b) => b.score - a.score);

  /* ================= AI ENHANCEMENT ================= */

  try {
    const aiResponse = await getRecommendations(worker, rankedJobs.slice(0, 20));

    if (aiResponse?.recommendations?.length) {
      rankedJobs = aiResponse.recommendations;
    }
  } catch (err) {
    console.warn("AI skipped, using internal ranking");
  }

  /* ================= FORMAT ================= */

  const formatted = rankedJobs.slice(0, 10).map(job => ({
    ...job,
    companyName: job.companyDetails?.companyName,
    companyImage: job.companyDetails?.companyImages?.[0] || null,
    workHours: job.dailyWorkHours,
    startTime: job.startDateTime,
    requiredWorkers: job.requiredWorkers,
  }));

  /* ================= RESPONSE ================= */

  res.status(200).json({
    status: "success",
    results: formatted.length,
    data: formatted,
  });
});