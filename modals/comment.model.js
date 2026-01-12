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
async function editComment({ commentId, userId, newMessage }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Get old comment + ticket
    const [[old]] = await conn.execute(
      `
      SELECT comment, ticket_id
      FROM ticket_comments
      WHERE id = ?
      `,
      [commentId]
    );

    if (!old) throw new Error("Comment not found");

    // 2️⃣ Update comment table
    await conn.execute(
      `
      UPDATE ticket_comments
      SET
        comment = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [newMessage, userId, commentId]
    );

    // 3️⃣ Update SAME activity row (no new activity)
    await conn.execute(
      `
      UPDATE ticket_activities
      SET
        new_value = ?,
        old_value = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE comment_id = ?
        AND activity_type = 'comment_added'
      `,
      [newMessage, old.comment, userId, commentId]
    );

    // 4️⃣ Fetch updated comment WITH updated_user_name
    const [[row]] = await conn.execute(
      `
      SELECT
        tc.id,
        tc.ticket_id,
        tc.user_id,
        u.name AS user_name,
        tc.comment,
        tc.created_at,
        uu.name AS updated_user_name
      FROM ticket_comments tc
      JOIN users u ON u.id = tc.user_id
      LEFT JOIN users uu ON uu.id = tc.updated_by
      WHERE tc.id = ?
      `,
      [commentId]
    );

    await conn.commit();
    return row;

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
async function deleteComment({ commentId, userId }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Get comment before delete
    const [[comment]] = await conn.execute(
      `
      SELECT
        tc.ticket_id,
        tc.comment,
        u.name AS comment_owner
      FROM ticket_comments tc
      JOIN users u ON u.id = tc.user_id
      WHERE tc.id = ?
      `,
      [commentId]
    );

    if (!comment) throw new Error("Comment not found");

    // 2️⃣ Delete comment
    await conn.execute(
      `DELETE FROM ticket_comments WHERE id = ?`,
      [commentId]
    );

    // 3️⃣ Log activity (WHO deleted + WHAT deleted)
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
        comment.ticket_id,
        userId,
        commentId,
        comment.comment,
        JSON.stringify({ deleted_by: userId })
      ]
    );

    // 4️⃣ Fetch deleted user name
    const [[deletedUser]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );

    await conn.commit();

    return {
      id: commentId,
      ticket_id: comment.ticket_id,
      deleted: true,
      deleted_by: userId,
      deleted_user_name: deletedUser?.name || "Unknown",
      deleted_comment: comment.comment,
      activity_id: activityRes.insertId
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
      u.name AS user_name
    FROM ticket_activities ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.ticket_id = ?
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
