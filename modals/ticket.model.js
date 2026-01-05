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
// exports.moveTicket = async ({ id, status_id, userId }) => {
//   await db.execute(
//     `UPDATE tickets SET status_id = ?, updated_by = ? WHERE id = ?`,
//     [status_id, userId, id]
//   );

//   return { id, status_id, updated_by: userId };
// };

const STATUS_MAP = {
  1: "Bug Found",
  2: "In progress",
  3: "In Review",
  4: "On Hold",
  5: "Reopen",
  6: "Closed",
};

exports.moveTicket = async ({ id, status_id, userId }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Get old ticket status
    const [[oldTicket]] = await conn.execute(
      `SELECT status_id FROM tickets WHERE id = ?`,
      [id]
    );

    if (!oldTicket) {
      throw new Error("Ticket not found");
    }

    const oldStatusId = oldTicket.status_id;

    // 2️⃣ Get user name
    const [[user]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );

    const userName = user?.name ?? "Unknown User";

    // Map IDs → readable names
    const oldStatusName = STATUS_MAP[oldStatusId] ?? "Unknown";
    const newStatusName = STATUS_MAP[status_id] ?? "Unknown";

    // 3️⃣ Update ticket
    await conn.execute(
      `UPDATE tickets
       SET status_id = ?, updated_by = ?
       WHERE id = ?`,
      [status_id, userId, id]
    );

    // 4️⃣ Insert activity log
    await conn.execute(
      `
      INSERT INTO ticket_activities
        (ticket_id, user_id, activity_type, old_value, new_value, created_at)
      VALUES
        (?, ?, 'status_changed', ?, ?, NOW())
      `,
      [id, userId, oldStatusName, newStatusName]
    );

    await conn.commit();

    // ✅ Return payload for UI / WebSocket
    return {
      id,
      status_id,
      updated_by: userId,
      user_name: userName,
      old_message: oldStatusName,
      message: newStatusName
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
