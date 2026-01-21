const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "uploads/documents";

    if (file.mimetype.startsWith("image/")) folder = "uploads/images";
    else if (file.mimetype.startsWith("video/")) folder = "uploads/videos";

    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },

  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const fileUrl = `/${req.file.path.replace(/\\/g, "/")}`;

  res.json({
    success: true,
    file: {
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
      url: fileUrl,
    }
  });
});

module.exports = router;
