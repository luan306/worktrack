// Đảm bảo DB có đúng các index cần cho hiệu năng
const db = require('./db');

// Index còn thiếu
const ADD = [
  // /auth/refresh tìm theo token — không có index thì quét toàn bảng mỗi lần gia hạn phiên
  ['refresh_tokens', 'idx_rt_token', '(token)'],
  // Danh sách thông báo: WHERE user_id=? ORDER BY id DESC
  ['notifications', 'idx_notif_user_id', '(user_id, id)'],
  // daily_entries là bảng lớn nhanh nhất
  ['daily_entries', 'idx_de_date_user', '(work_date, user_id)'],
];

// Index trùng lặp hoàn toàn với index khác — chỉ làm chậm INSERT/UPDATE
const DROP = [
  ['daily_task_logs', 'idx_log_task_user_date'], // trùng uq_log
  ['daily_task_logs', 'idx_task_user_date'],     // trùng uq_log
  ['daily_task_logs', 'idx_user_date'],          // trùng idx_log_user_date
  ['request_task_assignees', 'idx_user'],        // trùng idx_rta_user
  ['request_tasks', 'idx_rt_status'],            // trùng idx_status
];

// Bảng mới — tạo nếu chưa có (DB cũ lẫn DB mới dựng từ db-init đều tự có)
const TABLES = [
  // Ghi chú công việc hằng ngày: mỗi dòng = 1 việc user tự ghi trong 1 ngày (giờ không bắt buộc)
  `CREATE TABLE IF NOT EXISTS daily_entries (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     user_id     INT NOT NULL,
     work_date   DATE NOT NULL,
     start_time  TIME NULL,
     end_time    TIME NULL,
     title       VARCHAR(200) NOT NULL,
     description TEXT NULL,
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_de_user_date (user_id, work_date),
     CONSTRAINT fk_de_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // Điểm Leader chấm cho CẢ NGÀY làm việc của 1 người
  `CREATE TABLE IF NOT EXISTS daily_day_scores (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     user_id    INT NOT NULL,
     work_date  DATE NOT NULL,
     score      DECIMAL(4,1) NOT NULL,
     comment    TEXT NULL,
     scored_by  INT NULL,
     scored_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_dds_user_date (user_id, work_date),
     INDEX idx_dds_date (work_date),
     CONSTRAINT fk_dds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // Ngày nghỉ của 1 người: cả ngày (không ghi việc, không chấm) hoặc nửa buổi sáng/chiều
  `CREATE TABLE IF NOT EXISTS daily_day_offs (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     user_id     INT NOT NULL,
     work_date   DATE NOT NULL,
     kind        ENUM('full','am','pm') NOT NULL DEFAULT 'full',
     reason      VARCHAR(255) NULL,
     created_by  INT NULL,
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_ddo_user_date (user_id, work_date),
     INDEX idx_ddo_date (work_date),
     CONSTRAINT fk_ddo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // Link đính kèm của CV yêu cầu (tài liệu trên mạng nội bộ, thư mục chia sẻ, bản vẽ...)
  `CREATE TABLE IF NOT EXISTS request_task_links (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     task_id     INT NOT NULL,
     url         VARCHAR(2000) NOT NULL,
     title       VARCHAR(200) NULL,
     added_by    INT NULL,
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_rtl_task (task_id),
     CONSTRAINT fk_rtl_task FOREIGN KEY (task_id) REFERENCES request_tasks(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  // Ngày nghỉ lễ của CÔNG TY (Admin đặt, áp dụng cho mọi người) — 1 dòng / ngày
  `CREATE TABLE IF NOT EXISTS company_holidays (
     work_date   DATE NOT NULL PRIMARY KEY,
     name        VARCHAR(120) NOT NULL,
     created_by  INT NULL,
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function ensureIndexes() {
  try {
    for (const sql of TABLES) await db.query(sql);
    // Dò 1 lần các cột cần nâng cấp (DB cũ) thay vì mỗi cột 1 truy vấn information_schema
    const [colRows] = await db.query(
      `SELECT table_name AS t, column_name AS c, is_nullable AS n FROM information_schema.columns
        WHERE table_schema=DATABASE() AND (table_name, column_name) IN
              (('daily_entries','start_time'), ('daily_entries','span_start'), ('users','must_change_password'), ('request_task_assignees','score'), ('request_task_assignees','added_late'), ('activity_logs','actor_id'))`);
    const col = (t, c) => colRows.find(r => (r.t || r.TABLE_NAME) === t && (r.c || r.COLUMN_NAME) === c);

    // DB cũ: ghi chú công việc không cần giờ nữa → cho phép start_time/end_time để trống
    const timeCol = col('daily_entries', 'start_time');
    if (timeCol?.n === 'NO') {
      await db.query('ALTER TABLE daily_entries MODIFY start_time TIME NULL, MODIFY end_time TIME NULL');
      console.log('[indexes] daily_entries: giờ bắt đầu/kết thúc → không bắt buộc');
    }

    // Người được thêm vào CV SAU KHI CV đã nộp (chờ chấm / chờ duyệt) → đánh dấu để Manager thấy khi chấm điểm
    if (!col('request_task_assignees', 'added_late')) {
      await db.query('ALTER TABLE request_task_assignees ADD COLUMN added_late TINYINT(1) NOT NULL DEFAULT 0');
      console.log('[indexes] request_task_assignees.added_late → đánh dấu người thêm sau khi nộp');
    }

    // Bắt đổi mật khẩu mặc định: 1 = chỉ gọi được API đổi mật khẩu (bật khi đăng nhập bằng mật khẩu mặc định)
    if (!col('users', 'must_change_password')) {
      await db.query('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0');
      console.log('[indexes] users.must_change_password → bắt đổi mật khẩu mặc định');
    }

    // Việc làm NHIỀU NGÀY: mỗi ngày vẫn là 1 dòng riêng
    if (!col('daily_entries', 'span_start')) {
      await db.query('ALTER TABLE daily_entries ADD COLUMN span_start DATE NULL, ADD COLUMN span_end DATE NULL');
      console.log('[indexes] daily_entries.span_start/span_end → việc làm nhiều ngày');
    }

    // Chấm điểm CV yêu cầu RIÊNG cho từng người thực hiện (NULL = dùng điểm chung của CV)
    if (!col('request_task_assignees', 'score')) {
      await db.query('ALTER TABLE request_task_assignees ADD COLUMN score DECIMAL(4,1) NULL');
      console.log('[indexes] request_task_assignees.score → chấm điểm riêng từng người');
    }

    // Lịch sử thay đổi phải ghi được cả hành động của HỆ THỐNG
    if (col('activity_logs', 'actor_id')?.n === 'NO') {
      await db.query('ALTER TABLE activity_logs MODIFY actor_id INT NULL');
      console.log('[indexes] activity_logs.actor_id → cho phép NULL (hành động hệ thống)');
    }

    const [rows] = await db.query(
      'SELECT DISTINCT table_name AS t, index_name AS i FROM information_schema.statistics WHERE table_schema = DATABASE()'
    );
    const has = new Set(rows.map(r => `${r.t}.${r.i}`));
    for (const [table, name, cols] of ADD) {
      if (has.has(`${table}.${name}`)) continue;
      await db.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${cols}`);
      console.log(`[indexes] + ${table}.${name}`);
    }
    for (const [table, name] of DROP) {
      if (!has.has(`${table}.${name}`)) continue;
      await db.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``)
        .then(() => console.log(`[indexes] - ${table}.${name}`))
        .catch(e => console.warn(`[indexes] giữ ${table}.${name}: ${e.message}`));
    }
  } catch (e) {
    console.error('[indexes] lỗi:', e.message);
  }
}

module.exports = { ensureIndexes };
