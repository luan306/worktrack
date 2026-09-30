// Ngày 'YYYY-MM-DD' theo GIỜ ĐỊA PHƯƠNG của server.
// ⚠️ Không dùng new Date().toISOString().slice(0,10) — hàm đó trả về ngày UTC,
// nên từ 00:00 đến 07:00 sáng giờ VN sẽ ra ngày HÔM QUA.
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse 'YYYY-MM-DD' thành Date lúc 00:00 giờ địa phương (new Date('YYYY-MM-DD')
// mặc định hiểu là UTC).
const parseLocalDate = (s) => new Date(`${s}T00:00:00`);

// Cộng n ngày vào 'YYYY-MM-DD' → 'YYYY-MM-DD'
const addDays = (s, n) => { const d = parseLocalDate(s); d.setDate(d.getDate() + n); return localDate(d); };

// Thứ 2 của tuần chứa ngày s ('YYYY-MM-DD')
const mondayOf = (s) => addDays(s, -((parseLocalDate(s).getDay() + 6) % 7));

module.exports = { localDate, parseLocalDate, addDays, mondayOf };
