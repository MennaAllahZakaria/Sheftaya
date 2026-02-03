const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../utils/cloudinary");
const ApiError = require("../utils/apiError");

/* ============================================
   STORAGE
============================================ */

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "uploads";
    let resource_type = "raw";

    if (
      ["frontIdImage", "backIdImage", "selfieImage"].includes(file.fieldname)
    ) {
      folder = "identity_images";
      resource_type = "image";
    }

    else if (file.fieldname === "healthCertificate") {
      folder = "health_certificates";
      resource_type = file.mimetype.startsWith("image/") ? "image" : "raw";
    }

    else if (file.fieldname === "companyImages") {
      folder = "company_images";
      resource_type = "image";
    }

    return {
      folder,
      resource_type,
      public_id: `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    };
  },
});

/* ============================================
   FILTER
============================================ */

const fileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith("image/");
  const isPdf = file.mimetype === "application/pdf";

  if (
    ["frontIdImage", "backIdImage", "selfieImage"].includes(file.fieldname) &&
    !isImage
  ) {
    return cb(new ApiError("Only images allowed", 400), false);
  }

  if (file.fieldname === "healthCertificate" && !(isPdf || isImage)) {
    return cb(new ApiError("Only PDF or image allowed", 400), false);
  }

  if (file.fieldname === "companyImages" && !isImage) {
    return cb(new ApiError("Only images allowed", 400), false);
  }

  cb(null, true);
};

/* ============================================
   MULTER
============================================ */

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB safer
  },
});

/* ============================================
   MIDDLEWARES
============================================ */

exports.uploadImagesAndFiles = upload.fields([
  { name: "frontIdImage", maxCount: 1 },
  { name: "backIdImage", maxCount: 1 },
  { name: "selfieImage", maxCount: 1 },
  { name: "healthCertificate", maxCount: 1 },
  { name: "companyImages", maxCount: 5 },
]);

exports.attachUploadedLinks = (req, res, next) => {
  try {
    req.uploadedFiles = {};

    Object.keys(req.files || {}).forEach((key) => {
      req.uploadedFiles[key] = req.files[key].map((f) => f.path);
    });

    next();
  } catch {
    next(new ApiError("Error processing uploaded files", 500));
  }
};