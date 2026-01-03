const db = require("../utils/db"); // adjust path if needed

/* ============================= */
/* CREATE COMMENT */
/* ============================= */

async function createComment({ taskId, userId, message }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Insert comment
    const [commentResult] = await conn.execute(
      `
      INSERT INTO ticket_comments (ticket_id, user_id, comment, created_at)
      VALUES (?, ?, ?, NOW())
      `,
      [taskId, userId, message]
    );

    const commentId = commentResult.insertId;

    // 2️⃣ Insert activity (comment_added)
    await conn.execute(
      `
      INSERT INTO ticket_activities
        (ticket_id, user_id, activity_type, old_value, new_value, created_at)
      VALUES
        (?, ?, 'comment_added', ?, ?, NOW())
      `,
      [
        taskId,
        userId,
        null,        
        message      
      ]
    );

    // 3️⃣ Fetch created comment (for realtime UI)
    const [rows] = await conn.execute(
      `
      SELECT
        tc.id,
        tc.ticket_id,
        tc.user_id,
        u.name AS user_name,
        tc.comment,
        tc.created_at
      FROM ticket_comments tc
      JOIN users u ON u.id = tc.user_id
      WHERE tc.id = ?
      `,
      [commentId]
    );

    await conn.commit();

    return rows[0];

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}



/* ============================= */
/* GET COMMENTS BY TASK */
/* ============================= */
async function getCommentsByTask(taskId) {
  const [rows] = await db.execute(
    `
    SELECT 
      c.id,
      c.ticket_id,
      c.user_id,
      c.new_value AS message,
      c.created_at,
      u.name AS user_name
    FROM ticket_activities c
    JOIN users u ON u.id = c.user_id
    WHERE c.ticket_id = ?
    ORDER BY c.created_at ASC
    `,
    [taskId]
  );

  return rows;
}

async function createCommentAttachment({
  commentId,
  taskId,
  userId,
  fileType,
  fileUrl,
}) {
  const [res] = await db.execute(
    `
    INSERT INTO comment_attachments
      (comment_id, file_type, file_url)
    VALUES (?, ?, ?)
    `,
    [commentId, fileType, fileUrl]
  );

  const attachmentId = res.insertId;

  await db.execute(
    `
    INSERT INTO ticket_activities
      (ticket_id, user_id, activity_type, old_value, new_value, created_at)
    VALUES
      (?, ?, 'comment_attachment_added', NULL, ?, NOW())
    `,
    [taskId, userId, JSON.stringify({ fileType, fileUrl })]
  );

  return {
    id: attachmentId,
    comment_id: commentId,
    file_type: fileType,
    file_url: fileUrl,
    created_at: new Date(),
  };
}


module.exports = {
  createComment,
  getCommentsByTask,
  createCommentAttachment,
};
