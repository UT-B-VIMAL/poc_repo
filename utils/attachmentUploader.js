const fs = require("fs");
const path = require("path");
const { createCommentAttachment } = require("../modals/comment.model");

async function saveAttachment({ commentId, taskId, userId, file }) {
  const isImage = file.type?.startsWith("image/");
  const isVideo = file.type?.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new Error("Unsupported file type");
  }

  const folder = isImage ? "uploads/images" : "uploads/videos";
  const activityType = isImage ? "image_uploaded" : "video_uploaded";

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const safeName = file.name.replace(/\s+/g, "_");
  const fileName = `comment_${commentId}_${Date.now()}_${safeName}`;

  const filePath = path.join(folder, fileName);
  const fileUrl = `/${folder}/${fileName}`;

  const buffer = Buffer.from(file.data, "base64");
  fs.writeFileSync(filePath, buffer);

  return await createCommentAttachment({
    commentId,
    taskId,
    userId,
    fileType: isImage ? "image" : "video",
    fileUrl,
    activityType
  });
}

module.exports = { saveAttachment };
