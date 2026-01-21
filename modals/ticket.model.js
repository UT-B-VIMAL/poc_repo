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
  // get ticketId
  const ticketId = result.insertId;
    await db.execute(
      `
  INSERT INTO ticket_activities
    (ticket_id, user_id, activity_type, old_value, new_value, created_at)
  VALUES
    (?, ?,  'created', NULL, ?, NOW())
  `,
      [ticketId, userId, title]
    );

  return {
    id: ticketId,
    title,
    status_id,
    created_by: userId,
    updated_by: userId,
  };
};

/* UPDATE */
exports.updateTicket = async ({ id, title, status_id, userId, assigneeId, severity,infotag_name,infotag_color }) => {
  await db.execute(
    `UPDATE tickets
     SET title = ?, status_id = ?, updated_by = ?, assignee_id = ?,
       severity = ?,
       infotag_name = ?,
       infotag_color = ?,
     WHERE id = ?`,
    [title, status_id, userId, assigneeId, severity,infotag_name,infotag_color, id]
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

    const [result] = await conn.execute(
  `
  INSERT INTO ticket_activities
    (ticket_id, user_id, activity_type, old_value, new_value, created_at)
  VALUES
    (?, ?, 'status_changed', ?, ?, NOW())
  `,
  [id, userId, oldStatusName, newStatusName]
);

const insertId = result.insertId;

const [[row]] = await conn.execute(
  `
  SELECT created_at
  FROM ticket_activities
  WHERE id = ?
  `,
  [insertId]
);

await conn.commit();

return {
  id,
  status_id,
  updated_by: userId,
  user_name: userName,
  old_message: oldStatusName,
  message: newStatusName,
  activity_type: "status_changed",
  created_at: row.created_at
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
       assignee_id,
       severity,
       infotag_name,
       infotag_color,
       created_by,
       updated_by,
       created_at,
       updated_at
     FROM tickets
     ORDER BY updated_at DESC`
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

async function insertActivity(conn, {
  ticketId,
  userId,
  type,
  oldValue,
  newValue
}) {
  const [result] = await conn.execute(
    `
    INSERT INTO ticket_activities
      (ticket_id, user_id, activity_type, old_value, new_value, created_at)
    VALUES
      (?, ?, ?, ?, ?, NOW())
    `,
    [ticketId, userId, type, oldValue, newValue]
  );

  const [[row]] = await conn.execute(
    `SELECT created_at FROM ticket_activities WHERE id = ?`,
    [result.insertId]
  );

  return row.created_at;
}

exports.updateTicketTitle = async ({ id, title, userId }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[old]] = await conn.execute(
      `SELECT title FROM tickets WHERE id = ?`,
      [id]
    );
    if (!old) throw new Error("Ticket not found");
 const [[user]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );

    const userName = user?.name ?? "Unknown User";
    await conn.execute(
      `UPDATE tickets SET title = ?, updated_by = ? WHERE id = ?`,
      [title, userId, id]
    );

    const created_at = await insertActivity(conn, {
      ticketId: id,
      userId,
      type: "title_changed",
      oldValue: old.title,
      newValue: title
    });

    await conn.commit();

    return {
      id,
      title,
      updated_by: userId,
      old_message: old.title,
      message: title,
      user_name: userName,
      activity_type: "title_changed",
      created_at
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateTicketAssignee = async ({ id, assignee_id, userId }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[old]] = await conn.execute(
      `
      SELECT u.name AS name
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.id = ?
      `,
      [id]
    );

    const [[newUser]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [assignee_id]
    );
    const [[user]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );
    const userName = user?.name ?? "Unknown User";
    await conn.execute(
      `UPDATE tickets SET assignee_id = ?, updated_by = ? WHERE id = ?`,
      [assignee_id, userId, id]
    );

    const created_at = await insertActivity(conn, {
      ticketId: id,
      userId,
      type: "assignee_changed",
      oldValue: old?.name ?? "Unassigned",
      newValue: newUser?.name ?? "Unknown"
    });

    await conn.commit();

    return {
      id,
      assignee_id,
      old_message: old?.name ?? "Unassigned",
      message: newUser?.name ?? "Unknown",
      user_name: userName,
      activity_type: "assignee_changed",
      created_at
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateTicketSeverity = async ({ id, severity, userId }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[old]] = await conn.execute(
      `SELECT severity FROM tickets WHERE id = ?`,
      [id]
    );

    await conn.execute(
      `UPDATE tickets SET severity = ?, updated_by = ? WHERE id = ?`,
      [severity, userId, id]
    );
    const [[user]] = await conn.execute(
      `SELECT name FROM users WHERE id = ?`,
      [userId]
    );
    const userName = user?.name ?? "Unknown User";
    const created_at = await insertActivity(conn, {
      ticketId: id,
      userId,
      type: "severity_changed",
      oldValue: old.severity,
      newValue: severity
    });

    await conn.commit();

    return {
      id,
      severity,
      old_message: old.severity,
      message: severity,
      activity_type: "severity_changed",
      created_at,
      user_name: userName
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.getAssigneesList = async ({ boardId }) => {
  const [rows] = await db.execute(
    `
    SELECT DISTINCT
      u.id,
      u.name,
      u.email
    FROM users u
    INNER JOIN board_users bu ON bu.user_id = u.id
    WHERE bu.board_id = ?
      AND u.is_active = 1
    ORDER BY u.name ASC
    `,
    [boardId]
  );

  return rows;
};