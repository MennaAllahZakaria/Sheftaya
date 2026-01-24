const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../utils/cloudinary");
const ApiError = require("../utils/apiError");
const { v4: uuid } = require("uuid");
const FileType = require("file-type");

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const folders = {
      selfieImage: "kyc/selfies",
      frontIdImage: "kyc/front-id",
      backIdImage: "kyc/back-id",
    };

    const folder = folders[file.fieldname];
    if (!folder) {
      throw new ApiError("Invalid upload field", 400);
    }

    return {
      folder,
      resource_type: "image",
      public_id: `${req.user._id}/${uuid()}`,
      transformation: [
        { width: 1200, height: 1200, crop: "limit" },
        { quality: "auto" },
      ],
    };
  },
});

const fileFilter = async (req, file, cb) => {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new ApiError("Unsupported image format", 400), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

exports.uploadIdentityImages = [
  upload.fields([
    { name: "selfieImage", maxCount: 1 },
    { name: "frontIdImage", maxCount: 1 },
    { name: "backIdImage", maxCount: 1 },
  ]),

  (req, res, next) => {
    const required = ["selfieImage", "frontIdImage", "backIdImage"];
    const missing = required.filter(
      (field) => !req.files?.[field]?.length
    );

    if (missing.length) {
      return next(
        new ApiError(
          `Missing required files: ${missing.join(", ")}`,
          400
        )
      );
    }

    req.uploadedImages = {
      selfieImage: req.files.selfieImage[0].path,
      frontIdImage: req.files.frontIdImage[0].path,
      backIdImage: req.files.backIdImage[0].path,
    };

    next();
  },
];
