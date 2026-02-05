const express = require("express");
const {
    createAdmin,
    getAllAdmins,
    getAdmin,
    deleteAdmin,
    updateAdmin,
    getUser,
    deleteUser,
    updateStatusUser,
    getAllIdentityVerifications,
    verifyIdentity,
    rejectIdentity
    
} = require("../services/adminService");

const { protect , allowedTo } = require("../middleware/authMiddleware");

const {
    createAdminValidator,
    idValidator,
    updateAdminValidator,
    updateUserStatusValidator,
} = require("../utils/validators/adminValidator");

const router = express.Router();

// ================= ADMIN =================

router.use(protect, allowedTo("admin"));
// 📌 Create admin
router.post("/", createAdminValidator, createAdmin);
// 📌 Get all admins
router.get("/", getAllAdmins);
// 📌 Get specific admin by id
router.get("/:id", idValidator, getAdmin);
// 📌 Delete admin
router.delete("/:id", idValidator, deleteAdmin);
// 📌 Update admin
router.put("/:id", updateAdminValidator, updateAdmin);

//=======================User Management=========================
// 📌 Get  user
router.get("/users/:id", idValidator, getUser);
// 📌 Delete user
router.delete("/users/:id", idValidator, deleteUser);
// 📌 Update user status
router.patch("/users/:id/status", updateUserStatusValidator, updateStatusUser);

//=======================Identity Verification Management=========================
// 📌 Get all identity verifications
router.get("/identity-verifications", getAllIdentityVerifications);
// 📌 Approve identity verification
router.patch("/identity-verifications/:id/approve", idValidator, verifyIdentity);
// 📌 Reject identity verification
router.patch("/identity-verifications/:id/reject", idValidator, rejectIdentity);


module.exports = router;