const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");
const WorkerProfile = require("../models/workerProfileModel");
const EmployerProfile = require("../models/employerProfileModel");
const Verification = require("../models/verificationModel");
const IdentityVerification = require("../models/identityVerificationModel");

const ApiError = require("../utils/apiError");
const sendEmail = require("../utils/sendEmail");

/* ===================== Helpers ===================== */

const OTP_EXPIRY_MS = 10 * 60 * 1000;

const getSaltRounds = () => {
  return parseInt(process.env.HASH_PASS, 10) || 12;
};

const SALT_ROUNDS = getSaltRounds();


const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

const createAuthToken = (user) =>
  jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRE_TIME }
  );

const createTempToken = (email, type) =>
  jwt.sign(
    { email, type },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "10m" }
  );

/* =================================================== */
/* ===================== SIGNUP ====================== */
/* =================================================== */
exports.signup = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    phone,
    birthDate,
    role,
    city,
    workerProfile,
    employerProfile,
  } = req.body;

  /* =========================
     BASIC VALIDATION FIRST
  ========================== */


  if (!email || !password) {
    throw new ApiError("Email and password are required", 400);
  }

  // already active user
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError("Email already registered", 400);
  }

  if (password.length < 8) {
    throw new ApiError("Password must be at least 8 characters", 400);
  }

  if (!["worker", "employer"].includes(role)) {
    throw new ApiError("Invalid role", 400);
  }

  /* =========================
     PARSE JSON SAFELY
  ========================== */

  const workerData =
    typeof workerProfile === "string"
      ? JSON.parse(workerProfile)
      : workerProfile;

  const employerData =
    typeof employerProfile === "string"
      ? JSON.parse(employerProfile)
      : employerProfile;

  const files = { ...(req.uploadedFiles || {}) };

  if (!files.frontIdImage || !files.selfieImage || !files.backIdImage) {
    throw new ApiError("All ID images are required", 400);
  }

  /* =========================
     HASH PASSWORD LAST
  ========================== */

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const otp = generateOtp();

  /* =========================
     CHECK EXISTING VERIFICATION
  ========================== */

  let verification = await Verification.findOne({
    email,
    type: "emailVerification",
  }).select("+payload");

  const now = Date.now();

  if (verification) {
    // rate limit resend (30 sec)
    if (
      verification.lastSentAt &&
      now - verification.lastSentAt.getTime() < 30_000
    ) {
      throw new ApiError("Please wait before requesting another code", 429);
    }

    await Verification.findByIdAndDelete(verification._id);
    console.log ("delete old")
  } 
    verification = await Verification.create({
      email,
      code: hashOtp(otp),
      type: "emailVerification",
      expiresAt: new Date(now + OTP_EXPIRY_MS),
      lastSentAt: new Date(),
      payload: {
        userData: {
          firstName,
          lastName,
          email,
          phone,
          birthDate,
          password: hashedPassword,
          role,
          city,
        },
        workerData,
        employerData,
        files,
      },
    });
  

  /* =========================
     SEND EMAIL ONCE
  ========================== */

  await sendEmail({
    Email: email,
    subject: "Verify your account",
    message: `Your code is ${otp}`,
  });

  res.status(200).json({
    status: "success",
    message: "Signup request received. Please verify your email with the OTP sent.",
  });
});


// ===================== RESEND OTP =====================

exports.resendSignupOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const existingVerification = await Verification.findOne({ email , type: "emailVerification" });

  if (!existingVerification) {
    throw new ApiError("No signup request found for this email", 404);
  }
  if (existingVerification.resendCount >= 5 && existingVerification.lastSentAt && existingVerification.lastSentAt > new Date(Date.now() - 60 * 60 * 1000)) {
    await Verification.deleteOne({ _id: existingVerification._id });
    throw new ApiError("Too many resend attempts. Please signup again.", 400);
  }
  if (existingVerification.expiresAt < Date.now()) {
    await Verification.deleteOne({ _id: existingVerification._id });
    throw new ApiError("OTP expired. Please signup again.", 400);
  }

  const otp = generateOtp();

  existingVerification.code = hashOtp(otp);
  existingVerification.expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  await existingVerification.save();
    await sendEmail({
      Email: email,
      subject: "Resend OTP - Verify your account",
      message: `Your new OTP code is ${otp}`,
    });

  existingVerification.resendCount += 1;
  existingVerification.lastSentAt = new Date();
  await existingVerification.save();

  res.status(200).json({
    status: "success",
    message: "New OTP sent to email",
  });
});

/*==================================================== */
/* =============== VERIFY SIGNUP OTP ================== */
/*==================================================== */
exports.verifySignupOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const verification = await Verification
    .findOne({ email })
    .select("+code +payload");

  if (!verification) {
    throw new ApiError("Invalid or expired code", 400);
  }
  if (verification.expiresAt < Date.now()) {
    await Verification.deleteOne({ _id: verification._id });
    throw new ApiError("Invalid or expired code ", 400);
  }
  if (verification.type !== "emailVerification") {
    throw new ApiError("Invalid verification type", 400);
  }
  if (verification.attempts >= 5) {
    await Verification.deleteOne({ _id: verification._id });
    throw new ApiError("Too many failed attempts. Please signup again.", 400);
  }

  if (hashOtp(code) !== verification.code) {
    verification.attempts++;
    await verification.save();
    throw new ApiError("Invalid code", 400);
  }

  const payload = verification.payload || {};

  let { userData, workerData, employerData, files } = payload;

  if (typeof workerData === "string") workerData = JSON.parse(workerData);
  if (typeof employerData === "string") employerData = JSON.parse(employerData);

  const user = await User.create({
    ...userData,
    status: "active",
  });

  await IdentityVerification.create({
    userId: user._id,
    frontIdImage: files?.frontIdImage?.[0],
    backIdImage: files?.backIdImage?.[0],
    selfieImage: files?.selfieImage?.[0],
  });

  let profileData = null;
  if (user.role === "worker") {
   profileData = await WorkerProfile.create({
      userId: user._id,
      ...workerData,
      healthCertificate: files?.healthCertificate?.[0],
    });
  }

  if (user.role === "employer") {
   profileData = await EmployerProfile.create({
      userId: user._id,
      ...employerData,
      companyImages: files?.companyImages,
    });
  }

  await Verification.deleteOne({ _id: verification._id });

  const token = createAuthToken(user);

  res.status(200).json({
    status: "success",
    token,
    data:{
      user,
      profile: profileData,
    }
     
  });
});

/* =================================================== */
/* ===================== LOGIN ======================= */
/* =================================================== */

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new ApiError("Incorrect email or password", 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError("Incorrect email or password", 401);
  }

  if (user.status !== "active") {
    throw new ApiError("Account not active. Please verify your email.", 403);
  }

  let worker= null;
  if (user.role === "worker") {
    worker = await WorkerProfile.findOne({ userId: user._id });
  }
  let employer = null;
  if (user.role === "employer") {
    employer = await EmployerProfile.findOne({ userId: user._id });
  }

  const token = createAuthToken(user);

  res.status(200).json({
    status: "success",
    token,
    user: {
      id: user._id,
      data : {
        user,
        profile: user.role === "worker" ? worker : employer,
      }
    },
  });
});

/* =================================================== */
/* ============== FORGOT / RESET PASSWORD ============ */
/* =================================================== */

/**
 * POST /auth/password/forgot
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  await Verification.deleteMany({ email, type: "passwordReset" });

  if (!user) {
    return res.status(200).json({
      message: "If the email exists, a reset code was sent.",
    });
  }

  const otp = generateOtp();

  await Verification.create({
    email,
    code: hashOtp(otp),
    type: "passwordReset",
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  await sendEmail({
    Email: email,
    subject: "Password Reset",
    message: `Your password reset code is ${otp}`,
  });

  res.status(200).json({
    message: "If the email exists, a reset code was sent.",
  });
});

// ==================== RESEND PASSWORD RESET OTP ====================

exports.resendPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const existingVerification = await Verification.findOne({ email, type: "passwordReset" });

  if (!existingVerification) {
    throw new ApiError("No password reset request found for this email", 404);
  }
  if (existingVerification.resendCount >= 5 && existingVerification.lastSentAt && existingVerification.lastSentAt > new Date(Date.now() - 60 * 60 * 1000)) {
    await Verification.deleteOne({ _id: existingVerification._id });
    throw new ApiError("Too many resend attempts. Please initiate forgot password again.", 400);
  }
  if (existingVerification.expiresAt < Date.now()) {
    await Verification.deleteOne({ _id: existingVerification._id });
    throw new ApiError("OTP expired. Please initiate forgot password again.", 400);
  }

  const otp = generateOtp();

  existingVerification.code = hashOtp(otp);
  existingVerification.expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  await existingVerification.save();
  await sendEmail({
      Email: email,
      subject: "Resend OTP - Password Reset",
      message: `Your new password reset OTP code is ${otp}`,
    });

  existingVerification.resendCount += 1;
  existingVerification.lastSentAt = new Date();
  await existingVerification.save();

  res.status(200).json({
    status: "success",
    message: "New password reset OTP sent to email",
  });
});

/**
 * POST /auth/password/verify
 */
exports.verifyResetOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const verification = await Verification.findOne({
    email,
    type: "passwordReset",
  }).select("+code");

  if (!verification || verification.expiresAt < Date.now()) {
    throw new ApiError("Invalid or expired code", 400);
  }

  if (hashOtp(code) !== verification.code) {
    throw new ApiError("Invalid reset code", 400);
  }

  const resetToken = createTempToken(email, "reset");

  res.status(200).json({
    resetToken,
  });
});

/**
 * POST /auth/password/reset
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { newPassword } = req.body;

  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
  if (decoded.type !== "reset") {
    throw new ApiError("Invalid token", 401);
  }

  const user = await User.findOne({ email: decoded.email });
  if (!user) throw new ApiError("User not found", 404);

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordChangedAt = Date.now();
  await user.save();

  await Verification.deleteMany({ email: decoded.email });

  res.status(200).json({
    message: "Password reset successfully",
  });
});

// ==================== Change Password ====================
// @route   PUT /users/changePassword
// @access  Private (user)
exports.changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    return next(new ApiError("User not found", 404));
  }
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return next(new ApiError("Current password is incorrect", 401));
  }
  const saltRounds = getSaltRounds();
  user.password = await bcrypt.hash(newPassword, saltRounds);
  user.passwordChangedAt = Date.now();
  await user.save();

    const message = `
      Your password has been changed successfully.
      If you did not perform this action, please contact support immediately.
      ORB Team
      `;
  try {
    await sendEmail({
      Email: user.email,
      subject: "Password Changed Successfully",
      message,
    });
  } catch (err) {
    console.error("Error sending password change notification email:", err.message);
  }


  res.status(200).json({
    status: "success",
    message: "Password changed successfully.",
  });
});

exports.getLoggedInUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError("User not found", 404);
  }
  if (user.role === "worker") {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
    res.status(200).json({  
      status: "success",
      data:{user, workerProfile},
    });
    return;
  }
  else if (user.role === "employer") {
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });

  res.status(200).json({  
    status: "success",
    data:{user,
      profile: employerProfile},
  });
  }
});

exports.updateFCMToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError("User not found", 404);
  }
  // تحقق مما إذا كان الرمز موجودًا بالفعل
  const tokenExists = user.fcmTokens.some(
    (tokenObj) => tokenObj.token === fcmToken
  );
  if (!tokenExists) {
    user.fcmTokens.push({ token: fcmToken });
    await user.save();
  }
  res.status(200).json({
    status: "success",
    message: "FCM token updated successfully",
  });
});


exports.updatePreferredLanguage = asyncHandler(async (req, res, next) => {
  const { preferredLanguage } = req.body;
  const supportedLanguages = ["en", "ar"]; 

  if (!preferredLanguage || !supportedLanguages.includes(preferredLanguage)) {
    return next(new ApiError("Preferred language is invalid", 400));
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { preferredLang: preferredLanguage },
    { new: true }
  );
  if (!user) {
    return next(new ApiError("User not found", 404));
  } 
  res.status(200).json({
    status: "success",
    message: "Preferred language updated successfully.",
    preferredLanguage: user.preferredLang,
  });
});


exports.updateImageProfile = asyncHandler(async (req, res, next) => {
  if (!req.files?.imageProfile) {
    return next(new ApiError("No image file uploaded", 400));
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { imageProfile: req.imageProfileUrl },
    { new: true }
  );
  if (!user) {
    return next(new ApiError("User not found", 404));
  }
  res.status(200).json({
    status: "success",
    message: "Profile image updated successfully.",
    data: { imageProfile: user.imageProfile },
  });
});

