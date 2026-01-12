const fs = require("fs");
const path = require("path");
const commentModel = require("../modals/comment.model");
console.log("📌 commentModel:", commentModel);
const { createTicketAttachment } = commentModel;
console.log("📌 createTicketAttachment:", createTicketAttachment);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

async function saveAttachment({ commentId, taskId, userId, file }) {
  if (!file || !file.data || !file.type || !file.name) {
    throw new Error("Invalid file data");
  }

  /* ---------- Size Validation ---------- */
  const fileSize = Buffer.byteLength(file.data, "base64");
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 50 MB limit");
  }

  /* ---------- Type Validation ---------- */
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isPdf   = file.type === "application/pdf";
  const isWord  = file.type === "application/msword" || 
                  file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!isImage && !isVideo && !isPdf && !isWord) {
    throw new Error("Unsupported file type. Only images, videos, PDFs, and Word documents are allowed");
  }

  /* ---------- Folder & Metadata ---------- */
  let folder, fileType, activityType;

  if (isImage) {
    folder = "uploads/image";
    fileType = "image";
    activityType = "image_uploaded";
  } else if (isVideo) {
    folder = "uploads/video";
    fileType = "video";
    activityType = "video_uploaded";
  } else if (isPdf) {
    folder = "uploads/documents";
    fileType = "pdf";
    activityType = "document_uploaded";
  } else if (isWord) {
    folder = "uploads/documents"; // can also use "uploads/word" if you want a separate folder
    fileType = "word";
    activityType = "word_uploaded";
  }

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  /* ---------- File Save ---------- */
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `comment_${commentId}_${Date.now()}_${safeName}`;
  const filePath = path.join(folder, fileName);
  const fileUrl = `/${folder}/${fileName}`;

  const buffer = Buffer.from(file.data, "base64");
  fs.writeFileSync(filePath, buffer);

  /* ---------- DB Entry ---------- */
  return await createTicketAttachment({
    taskId,
    userId,
    fileType,
    fileUrl,
    activityType
  });
}

module.exports = { saveAttachment };
