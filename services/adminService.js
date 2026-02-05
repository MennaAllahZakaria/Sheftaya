const bcrypt = require("bcrypt");
const asyncHandler = require("express-async-handler");

const User = require("../models/userModel");
const IdentityVerification = require("../models/identityVerificationModel");
const sendEmail = require("../utils/sendEmail");
const ApiError = require("../utils/apiError");
const HandlerFactory = require("./handlerFactory");
const { generateStrongPassword } = require("../utils/generatePassword");

// Helper: get salt rounds from env (used for password hashing)
const getSaltRounds = () => parseInt(process.env.HASH_PASS, 10) || 12;

/**
 * ============================
 * ADMIN CREATION & MANAGEMENT
 * ============================
 */

/**
 * @desc    Create a new admin user
 * @route   POST /admin/admins
 * @access  Private (super admin)
 */
exports.createAdmin = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, phone } = req.body;

  if (!firstName || !lastName || !email) {
    return next(
      new ApiError("firstName, lastName and email are required", 400)
    );
  }

  // Ensure email is not already registered
  const existing = await User.findOne({ email });
  if (existing) return next(new ApiError("Email already in use", 400));

  // Generate strong random password and hash it
  const password = generateStrongPassword();
  const hashedPassword = await bcrypt.hash(password, getSaltRounds());

  // Force role = "admin"
  const newAdmin = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password: hashedPassword,
    role: "admin",
  });
  console.log("New admin created:", password);

  // Try to send credentials email (do NOT break if email fails)
  try {
    const message = `
                  Hi ${firstName} ${lastName},
                  Your admin account has been created.
                  Your temporary password is: ${password}
                  Please change your password after logging in.
                  `;
    await sendEmail({
      Email: email,
      subject: "Your Admin Account Details",
      message,
    });
  } catch (err) {
    console.error("Error sending email to new admin:", err.message);
  }

  res.status(201).json({
    status: "success",
    data: newAdmin,
  });
});

/**
 * @desc    Get all admins
 * @route   GET /admin/admins
 * @access  Private (admin)
 */
exports.getAllAdmins = asyncHandler(async (req, res, next) => {
  const admins = await User.find({ role: "admin" }).select(
    "firstName lastName email phone createdAt imageProfile"
  );

  res.status(200).json({
    status: "success",
    results: admins.length,
    data: admins,
  });
});

/**
 * @desc    Get a specific admin by id
 * @route   GET /admin/admins/:id
 * @access  Private (admin)
 */
exports.getAdmin = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const admin = await User.findOne({ _id: id, role: "admin" });
  if (!admin) {
    return next(new ApiError("Admin not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: admin,
  });
});

/**
 * @desc    Delete an admin
 * @route   DELETE /admin/admins/:id
 * @access  Private (admin)
 */
exports.deleteAdmin = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Prevent an admin from deleting themselves
  if (req.user._id.toString() === id) {
    return next(
      new ApiError("You cannot delete your own admin account", 400)
    );
  }

  const admin = await User.findOne({ _id: id, role: "admin" });
  if (!admin) {
    return next(new ApiError("Admin not found", 404));
  }

  await User.deleteOne({ _id: id });

  res.status(200).json({
    status: "success",
    message: "Admin deleted successfully",
  });
});

/**
 * @desc    Update admin basic info (NOT password/role)
 * @route   PATCH /admin/admins/:id
 * @access  Private (admin)
 */
exports.updateAdmin = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };

  // Prevent role change away from "admin"
  if (updates.role && updates.role !== "admin") {
    return next(new ApiError("Cannot change role of an admin", 400));
  }

  // Prevent password change via this endpoint
  if (Object.prototype.hasOwnProperty.call(updates, "password")) {
    return next(
      new ApiError(
        "Cannot change password here. Use the dedicated password endpoint.",
        400
      )
    );
  }

  const admin = await User.findOneAndUpdate(
    { _id: id, role: "admin" },
    updates,
    { new: true }
  );

  if (!admin) {
    return next(new ApiError("Admin not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: admin,
  });
});

/**
 * ======================
 * GENERIC USER MANAGEMENT
 * ======================
 *
 * NOTE: These are generic handlers. Make sure the routes using them are
 * protected with admin-only authorization.
 */

// Get any user by id (admin usage only)
exports.getUser = HandlerFactory.getOne(User);

// Delete any user by id (admin usage only)
exports.deleteUser = HandlerFactory.deleteOne(User);

/**
 * @desc    Update user status (active/inactive/banned)
 * @route   PATCH /admin/users/:id/status
 * @access  Private (admin)
 */
exports.updateStatusUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "inactive", "banned"].includes(status)) {
    return next(new ApiError("Invalid status value", 400));
  }

  const user = await User.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: user,
  });
});

// ================================================
// IDENTITY VERIFICATION MANAGEMENT
// ================================================

// Get all identity verification requests
exports.getAllIdentityVerifications = asyncHandler(async (req, res, next) => {
  const verifications = await IdentityVerification.find()
    .populate("userId", "firstName lastName email")
    .populate("verifiedBy", "firstName lastName email");
  res.status(200).json({
    status: "success",
    results: verifications.length,
    data: verifications,
  });
});

exports.verifyIdentity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const identity = await IdentityVerification.findOne({ userId: id });
  if (!identity) {
    return next(new ApiError("Identity verification not found", 404));
  }
  if (identity.status !== "pending") {
    return next(new ApiError("Identity verification already processed", 400));
  }

  identity.status = "approved";
  identity.verifiedBy = req.user._id;
  identity.verifiedAt = Date.now();
  await identity.save();
 
  res.status(200).json({
    status: "success",
    data: identity,
  });
});

exports.rejectIdentity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason) {
    return next(new ApiError("Rejection reason is required", 400));
  }

  const identity = await IdentityVerification.findOne({ userId: id });
  if (!identity) {
    return next(new ApiError("Identity verification not found", 404));
  }
  if (identity.status !== "pending") {
    return next(new ApiError("Identity verification already processed", 400));
  }

  identity.status = "rejected";
  identity.rejectionReason = reason;
  identity.verifiedBy = req.user._id;
  identity.verifiedAt = Date.now();
  await identity.save();

  res.status(200).json({
    status: "success",
    data: identity,
  });
});