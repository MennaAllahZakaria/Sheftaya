const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../utils/cloudinary");
const ApiError = require("../utils/apiError");

/* =================================================
   CLOUDINARY STORAGE
================================================= */

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "uploads";
    let resource_type = "raw";

    // KYC Images
    if (
      ["frontIdImage", "backIdImage", "selfieImage"].includes(file.fieldname)
    ) {
      folder = "identity_images";
      resource_type = "image";
    }

    // Health certificate
    else if (file.fieldname === "healthCertificate") {
      folder = "health_certificates";
      resource_type = file.mimetype.startsWith("image/") ? "image" : "raw";
    }

    // Company images
    else if (file.fieldname === "companyImages") {
      folder = "company_images";
      resource_type = "image";
    }

    return {
      folder,
      resource_type,

      // safer than originalname
      public_id: `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    };
  },
});

/* =================================================
   FILE FILTER (SECURE + CLEAN)
================================================= */

const fileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith("image/");
  const isPdf = file.mimetype === "application/pdf";

  // ID + selfie → images only
  if (
    ["frontIdImage", "backIdImage", "selfieImage"].includes(file.fieldname) &&
    !isImage
  ) {
    return cb(new ApiError("Only images allowed", 400), false);
  }

  // certificate → pdf or image
  if (file.fieldname === "healthCertificate" && !(isPdf || isImage)) {
    return cb(new ApiError("Only PDF or image allowed", 400), false);
  }

  // company images → images only
  if (file.fieldname === "companyImages" && !isImage) {
    return cb(new ApiError("Only images allowed for companyImages", 400), false);
  }

  cb(null, true);
};

/* =================================================
   MULTER CONFIG
================================================= */

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB safer
  },
});

/* =================================================
   UPLOAD MIDDLEWARE
================================================= */

exports.uploadImagesAndFiles = upload.fields([
  { name: "frontIdImage", maxCount: 1 },
  { name: "backIdImage", maxCount: 1 },
  { name: "selfieImage", maxCount: 1 },
  { name: "healthCertificate", maxCount: 1 },
  { name: "companyImages", maxCount: 5 },
]);

/* =================================================
   ATTACH LINKS (SCALABLE)
================================================= */

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