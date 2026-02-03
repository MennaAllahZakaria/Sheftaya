const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../utils/cloudinary");
const ApiError = require("../utils/apiError");

// إعدادات تخزين عامة على Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "uploads";
    let resource_type = "raw";

    if (file.fieldname === "frontIdImage" || file.fieldname === "backIdImage" || file.fieldname === "selfieImage") {
      folder = "idenity_images";
      resource_type = "image";
    } else if (file.fieldname === "healthCertificate") {
      folder = "healthCertificates";
      resource_type = (file.mimetype.startsWith("image/")) ? "image" : "raw";
    }else if (file.fieldname === "companyImages") {
      folder = "company_images";
      resource_type = "image";
    }

    return {
      folder,
      resource_type,
      public_id: `${Date.now()}-${file.originalname.split(".")[0].trim().replace(/\s+/g, "_")}`,
      format: file.mimetype.split("/")[1],
    };
  },
});

// الفلتر للتأكد من نوع الملفات المقبولة
const fileFilter = (req, file, cb) => {
  if (
    file.fieldname === "frontIdImage"    &&
    !file.mimetype.startsWith("image/")
  ) {
    return cb(new ApiError("Only images allowed for frontIdImage", 400), false);
  }

  if (
    file.fieldname === "backIdImage"    &&
    !file.mimetype.startsWith("image/")
  ) {
    return cb(new ApiError("Only images allowed for backIdImage", 400), false);
  }

  if (
     file.fieldname === "selfieImage"   &&
    !file.mimetype.startsWith("image/")
  ) {
    return cb(new ApiError("Only images allowed for selfieImage", 400), false);
  }

  
  if (
    file.fieldname === "healthCertificate" &&
    file.mimetype !== "application/pdf" || file.mimetype.startsWith("image/")
  ) {
    return cb(new ApiError("Only PDF & image allowed for healthCertificate", 400), false);
  }
  if (
    file.fieldname === "company_images" &&
    file.mimetype.startsWith("image/")
  ) {
    return cb(new ApiError("Onlyimage allowed for company_images", 400), false);
  }

  cb(null, true);
};

// إعداد multer
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ميدل وير لرفع صورة وملف معًا
exports.uploadImagesAndFiles = upload.fields([
  { name: "frontIdImage", maxCount: 1 },
  { name: "backIdImage", maxCount: 1 },
  { name: "selfieImage", maxCount: 1 },
  { name: "healthCertificate", maxCount: 1 },
  { name: "company_images", maxCount: 5 },
]);

// ميدل وير لإضافة اللينكات في req
exports.attachUploadedLinks = (req, res, next) => {
  try {
    if (req.files?.frontIdImage?.[0]) {
      req.frontIdImageUrl = req.files.frontIdImage[0].path;
    }
    if (req.files?.backIdImage?.[0]) {
      req.backIdImageUrl = req.files.backIdImage[0].path;
    }
    if (req.files?.selfieImage?.[0]) {
      req.selfieImageUrl = req.files.selfieImage[0].path;
    }
    if (req.files?.healthCertificate?.[0]) {
      req.healthCertificateUrl = req.files.healthCertificate[0].path;
    }
    if (req.files?.company_images?.[0]) {
      req.company_imagesUrl = req.files.company_images[0].path;
    }


    next();
  } catch (err) {
    next(new ApiError("Error processing uploaded files", 500));
  }
};
