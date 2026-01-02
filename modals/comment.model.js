const db = require("../utils/db"); // adjust path if needed

/* ============================= */
/* CREATE COMMENT */
/* ============================= */
async function createComment({ taskId, userId, message }) {
  const [result] = await db.execute(
    `
    INSERT INTO comments (task_id, user_id, message, created_at)
    VALUES (?, ?, ?, NOW())
    `,
    [taskId, userId, message]
  );

  const [rows] = await db.execute(
    `
    SELECT 
      c.id,
      c.task_id,
      c.user_id,
      c.message,
      c.created_at,
      u.name AS user_name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
    `,
    [result.insertId]
  );

  return rows[0];
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

module.exports = {
  createComment,
  getCommentsByTask,
};
