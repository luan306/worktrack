// Ngày 'YYYY-MM-DD' theo GIỜ ĐỊA PHƯƠNG của server
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse 'YYYY-MM-DD' thành Date lúc 00:00 giờ địa phương
const parseLocalDate = (s) => new Date(`${s}T00:00:00`);

// Cộng n ngày vào 'YYYY-MM-DD' → 'YYYY-MM-DD'
const addDays = (s, n) => { const d = parseLocalDate(s); d.setDate(d.getDate() + n); return localDate(d); };

// Thứ 2 của tuần chứa ngày s ('YYYY-MM-DD')
const mondayOf = (s) => addDays(s, -((parseLocalDate(s).getDay() + 6) % 7));

// Thứ 7 / Chủ nhật (công ty làm T2–T6)
const isWeekend = (s) => [0, 6].includes(parseLocalDate(s).getDay());

module.exports = { localDate, parseLocalDate, addDays, mondayOf, isWeekend };
