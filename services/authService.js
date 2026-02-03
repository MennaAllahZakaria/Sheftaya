const crypto = require("crypto");
const bcrypt = require("bcrypt");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");
const WorkerProfile = require("../models/workerProfileModel");
const EmployerProfile = require("../models/employerProfileModel");
const Verification = require("../models/verificationModel");

const ApiError = require("../utils/apiError");
const sendEmail = require("../utils/sendEmail");
const { profile } = require("console");

/* ===================== Helpers ===================== */

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const SALT_ROUNDS = process.env.HASH_PASS ;

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

/**
 * POST /auth/signup/request
 */
exports.signupRequest = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError("Email and password are required", 400);
  }

  if (password.length < 8) {
    throw new ApiError("Password must be at least 8 characters", 400);
  }

  await Verification.deleteMany({ email, type: "emailVerification" });

  const otp = generateOtp();
  const hashedOtp = hashOtp(otp);

  await Verification.create({
    email,
    code: hashedOtp,
    type: "emailVerification",
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  await sendEmail({
    Email: email,
    subject: "Verify your email",
    message: `Your verification code is ${otp}. It expires in 10 minutes.`,
  });

  res.status(200).json({
    status: "success",
    message: "If the email is valid, a verification code was sent.",
  });
});

/**
 * POST /auth/signup/verify
 */
exports.verifySignupOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const verification = await Verification.findOne({
    email,
    type: "emailVerification",
  }).select("+code");

  if (!verification || verification.expiresAt < Date.now()) {
    throw new ApiError("Invalid or expired code", 400);
  }

  const isValid = hashOtp(code) === verification.code;
  if (!isValid) {
    throw new ApiError("Invalid verification code", 400);
  }

  const signupToken = createTempToken(email, "signup");

  res.status(200).json({
    status: "success",
    signupToken,
  });
});

/**
 * POST /auth/signup/complete
 */
exports.completeSignup = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) throw new ApiError("Unauthorized", 401);

  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
  if (decoded.type !== "signup") {
    throw new ApiError("Invalid token", 401);
  }

  const {
    firstName,
    lastName,
    password,
    role,
    city,
    workerProfile,
    employerProfile,
  } = req.body;


  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    firstName,
    lastName,
    email: decoded.email,
    password: hashedPassword,
    role,
    city,
  });

  if (role === "worker") {
    const worker= await WorkerProfile.create({
      userId: user._id,
      ...workerProfile,
    });
    user.workerProfile = worker._id;
    await user.save();
  }

  if (role === "employer") {
   const employer = await EmployerProfile.create({
      userId: user._id,
      ...employerProfile,
    });
    user.employerProfile = employer._id;
    await user.save();
  }

  await Verification.deleteMany({ email: decoded.email });

  const authToken = createAuthToken(user);

  res.status(201).json({
    status: "success",
    token: authToken,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      city: user.city,
    },
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

  let workerProfile = null;
  if (user.role === "worker") {
    workerProfile = await WorkerProfile.findOne({ userId: user._id });
  }
  let employerProfile = null;
  if (user.role === "employer") {
    employerProfile = await EmployerProfile.findOne({ userId: user._id });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError("Incorrect email or password", 401);
  }

  const token = createAuthToken(user);

  res.status(200).json({
    status: "success",
    token,
    user: {
      id: user._id,
      data : {
        user,
        profile: user.role === "worker" ? workerProfile : employerProfile,
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

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
    data:{user},
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