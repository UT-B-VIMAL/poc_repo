const db = require("../utils/db");

exports.createTicket = async ({
  title,
  status_id,
  userId,
}) => {
  const [result] = await db.execute(
    `INSERT INTO tickets (title, status_id, created_by, updated_by)
     VALUES (?, ?, ?, ?)`,
    [title, status_id, userId, userId]
  );

  return {
    id: result.insertId,
    title,
    status_id,
    created_by: userId,
    updated_by: userId,
  };
};

/* UPDATE */
exports.updateTicket = async ({ id, title, status_id, userId }) => {
  await db.execute(
    `UPDATE tickets
     SET title = ?, status_id = ?, updated_by = ?
     WHERE id = ?`,
    [title, status_id, userId, id]
  );

  return { id, title, status_id, updated_by: userId };
};

/* DELETE */
exports.deleteTicket = async ({ id }) => {
  await db.execute(`DELETE FROM tickets WHERE id = ?`, [id]);
  return { id };
};

/* MOVE */
exports.moveTicket = async ({ id, status_id, userId }) => {
  await db.execute(
    `UPDATE tickets SET status_id = ?, updated_by = ? WHERE id = ?`,
    [status_id, userId, id]
  );

  return { id, status_id, updated_by: userId };
};

exports.getAllTickets = async () => {
  const [rows] = await db.execute(
    `SELECT 
       id,
       title,
       status_id,
       created_by,
       updated_by,
       created_at,
       updated_at
     FROM tickets
     ORDER BY id ASC`
  );

  return rows;
};

exports.getTicketsByUser = async (userId) => {
  const [rows] = await db.execute(
    `SELECT 
       id,
       title,
       status_id,
       created_by,
       updated_by,
       created_at,
       updated_at
     FROM tickets
     WHERE created_by = ?
     ORDER BY id DESC`,
    [userId]
  );

  return rows;
};
