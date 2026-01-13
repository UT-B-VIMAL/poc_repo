const db = require("../utils/db");

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

    // 2️⃣ Insert activity
    await conn.execute(
      `
  INSERT INTO ticket_activities
    (ticket_id, user_id, comment_id, activity_type, old_value, new_value, created_at)
  VALUES
    (?, ?, ?, 'comment_added', NULL, ?, NOW())
  `,
      [taskId, userId, commentId, message]
    );


    // 3️⃣ Fetch created comment
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
/* EDIT COMMENT */
/* ============================= */
async function editComment({ activityId, content, userId }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Get original activity + comment
    const [[activity]] = await conn.execute(
      `
      SELECT
        ta.id AS activity_id,
        ta.comment_id,
        ta.ticket_id,
        tc.comment AS old_comment
      FROM ticket_activities ta
      JOIN ticket_comments tc ON tc.id = ta.comment_id
      WHERE ta.id = ?
        AND ta.activity_type = 'comment_added'
        AND ta.deleted_at IS NULL
      `,
      [activityId]
    );

    if (!activity) throw new Error("Activity not found");

    const { comment_id, ticket_id, old_comment } = activity;

    // 2️⃣ Update comment table (source of truth)
    await conn.execute(
      `
  UPDATE ticket_comments
  SET comment = ?
  WHERE id = ?
  `,
      [content, comment_id]
    );


    // 3️⃣ UPDATE SAME activity row (important 🔥)
    await conn.execute(
      `
      UPDATE ticket_activities
      SET
        new_value = ?,
        old_value = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [content, old_comment, userId, activityId]
    );

    // 4️⃣ (Optional) Insert history row for audit (not UI)
    await conn.execute(
      `
      INSERT INTO ticket_activities
        (
          ticket_id,
          user_id,
          activity_type,
          comment_id,
          old_value,
          new_value,
          created_at
        )
      VALUES
        (?, ?, 'comment_edited', ?, ?, ?, NOW())
      `,
      [ticket_id, userId, comment_id, old_comment, content]
    );

    // 5️⃣ Get editor name
    const [[editor]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );

    await conn.commit();

    // ✅ IMPORTANT: return SAME activity id
    return {
      id: activityId, // 👈 SAME ROW UPDATED
      ticket_id,
      message: content,
      edited: true,
      old_message: old_comment,
      updated_by: userId,
      updated_user_name: editor?.name || "Unknown",
      updated_at: new Date(),
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}




/* ============================= */
/* DELETE COMMENT */
/* ============================= */
async function deleteComment({ activityId, userId }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log("Deleting activity:", activityId, "by user:", userId);

    // 1️⃣ Get activity → comment + owner + ticket
    const [[activity]] = await conn.execute(
      `
      SELECT
        ta.comment_id,
        ta.ticket_id,
        tc.comment,
        u.name AS comment_owner_name
      FROM ticket_activities ta
      LEFT JOIN ticket_comments tc ON tc.id = ta.comment_id
      LEFT JOIN users u ON u.id = tc.user_id
      WHERE ta.id = ?
      `,
      [activityId]
    );

    if (!activity) throw new Error("Activity not found");

    await conn.execute(
      `
  UPDATE ticket_activities
  SET
    deleted_at = NOW() 
  WHERE id = ?
  `,
      [activityId]
    );


    const {
      comment_id,
      ticket_id,
      comment,
      comment_owner_name,
    } = activity;

    // 2️⃣ Delete comment
    if (comment_id) {
      await conn.execute(
        `DELETE FROM ticket_comments WHERE id = ?`,
        [comment_id]
      );
    }

    // 3️⃣ Log delete activity
    const [activityRes] = await conn.execute(
      `
      INSERT INTO ticket_activities
        (
          ticket_id,
          user_id,
          activity_type,
          comment_id,
          old_value,
          new_value,
          created_at
        )
      VALUES
        (?, ?, 'comment_deleted', ?, ?, ?, NOW())
      `,
      [
        ticket_id,
        userId,
        comment_id ?? null,
        comment,
        JSON.stringify({
          deleted_by: userId,
          comment_owner: comment_owner_name,
        }),
      ]
    );

    // 4️⃣ Get deleter name
    const [[deleter]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );

    await conn.commit();

    // ✅ RETURN EXACT FRONTEND SHAPE
    return {
      id: activityId,                 // used to remove original activity
      ticket_id,
      deleted: true,
      deleted_by: userId,
      deleted_user_name: deleter?.name || "Unknown",
      deleted_comment: comment,
      created_at: new Date(),
      activity_id: activityRes.insertId,
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}




/* ============================= */
/* GET COMMENTS + ACTIVITIES */
/* ============================= */
async function getCommentsByTask(taskId) {
  const [rows] = await db.execute(
    `
    SELECT 
      ta.id,
      ta.ticket_id,
      ta.user_id,
      ta.activity_type,
      ta.old_value AS old_message,
      ta.new_value AS message,
      ta.created_at,
      ta.updated_by,
      u.name AS user_name,
      ub.name AS updated_user_name
    FROM ticket_activities ta
    JOIN users u ON u.id = ta.user_id
    LEFT JOIN users ub ON ub.id = ta.updated_by
    WHERE ta.ticket_id = ? AND ta.deleted_at IS NULL
    ORDER BY ta.created_at ASC
    `,
    [taskId]
  );

  return rows;
}

/* ============================= */
/* ATTACHMENTS */
/* ============================= */
async function createTicketAttachment({
  taskId,
  userId,
  fileType,
  fileUrl,
}) {
  // 1️⃣ Save attachment
  const [res] = await db.execute(
    `
    INSERT INTO comment_attachments
      (ticket_id, file_type, file_url)
    VALUES (?, ?, ?)
    `,
    [taskId, fileType, fileUrl]
  );

  // 2️⃣ Log activity
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
    id: res.insertId,
    file_type: fileType,
    file_url: fileUrl,
    created_at: new Date(),
  };
}

module.exports = {
  createComment,
  editComment,
  deleteComment,
  getCommentsByTask,
  createTicketAttachment,
};
