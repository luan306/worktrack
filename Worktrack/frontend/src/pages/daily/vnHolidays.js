// Gợi ý ngày nghỉ lễ Việt Nam cho 1 năm

const TZ = 7;
const { floor, sin, PI } = Math;

const jdFromDate = (dd, mm, yy) => {
  const a = floor((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
  return dd + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045;
};
const jdToDate = (jd) => {
  const a = jd + 32044, b = floor((4 * a + 3) / 146097), c = a - floor(b * 146097 / 4);
  const d = floor((4 * c + 3) / 1461), e = c - floor(1461 * d / 4), m = floor((5 * e + 2) / 153);
  return { day: e - floor((153 * m + 2) / 5) + 1, month: m + 3 - 12 * floor(m / 10), year: b * 100 + d - 4800 + floor(m / 10) };
};
// Thời điểm trăng mới (sóc) thứ k tính từ 1/1/1900, theo ngày Julius
const newMoon = (k) => {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * sin(M * dr) + 0.0021 * sin(2 * dr * M);
  C1 = C1 - 0.4068 * sin(Mpr * dr) + 0.0161 * sin(dr * 2 * Mpr);
  C1 -= 0.0004 * sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * sin(dr * 2 * F) - 0.0051 * sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * sin(dr * (M - Mpr)) + 0.0004 * sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * sin(dr * (2 * F - M)) - 0.0006 * sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.0010 * sin(dr * (2 * F - Mpr)) + 0.0005 * sin(dr * (2 * Mpr + M));
  const deltat = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltat;
};
const newMoonDay = (k) => floor(newMoon(k) + 0.5 + TZ / 24);
// Kinh độ mặt trời (chia 12 cung, 0..11) tại ngày Julius
const sunLongitude = (dayNumber) => {
  const T = (dayNumber - 0.5 - TZ / 24 - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * sin(dr * 2 * M) + 0.000290 * sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * floor(L / (PI * 2));
  return floor(L / PI * 6);
};
// Ngày bắt đầu tháng 11 âm lịch (tháng chứa Đông chí) của năm dương yy
const lunarMonth11 = (yy) => {
  const k = floor((jdFromDate(31, 12, yy) - 2415021) / 29.530588853);
  const nm = newMoonDay(k);
  return sunLongitude(nm) >= 9 ? newMoonDay(k - 1) : nm;
};
// Vị trí tháng nhuận (tính từ tháng 11) trong năm âm có 13 tháng
const leapMonthOffset = (a11) => {
  const k = floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last, i = 1, arc = sunLongitude(newMoonDay(k + i));
  do { last = arc; i++; arc = sunLongitude(newMoonDay(k + i)); } while (arc !== last && i < 14);
  return i - 1;
};

/** Đổi ngày ÂM (tháng thường, không nhuận) sang dương: → { day, month, year } */
export function lunarToSolar(lunarDay, lunarMonth, lunarYear) {
  const a11 = lunarMonth < 11 ? lunarMonth11(lunarYear - 1) : lunarMonth11(lunarYear);
  const b11 = lunarMonth < 11 ? lunarMonth11(lunarYear) : lunarMonth11(lunarYear + 1);
  const k = floor(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365 && off >= leapMonthOffset(a11)) off += 1; // năm nhuận: các tháng sau tháng nhuận lùi 1
  return jdToDate(newMoonDay(k + off) + lunarDay - 1);
}

const pad = (n) => String(n).padStart(2, '0');
const iso = ({ day, month, year }) => `${year}-${pad(month)}-${pad(day)}`;
const shift = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso({ day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() }); };

/**
 * Các kỳ nghỉ lễ theo luật lao động Việt Nam trong năm dương `year`:
 * [{ key, name, from, to, note }] — from/to dạng 'YYYY-MM-DD'.
 */
export function suggestVnHolidays(year) {
  const tet = iso(lunarToSolar(1, 1, year));   // mùng 1 Tết
  const gioTo = iso(lunarToSolar(10, 3, year)); // 10/3 âm lịch
  return [
    { key: 'new_year', name: 'Tết Dương lịch', from: `${year}-01-01`, to: `${year}-01-01` },
    { key: 'tet', name: 'Tết Nguyên đán', from: shift(tet, -1), to: shift(tet, 3), note: 'Giao thừa → mùng 4 (5 ngày)' },
    { key: 'hung_kings', name: 'Giỗ Tổ Hùng Vương', from: gioTo, to: gioTo, note: '10/3 âm lịch' },
    { key: 'reunification', name: 'Ngày Giải phóng miền Nam 30/4', from: `${year}-04-30`, to: `${year}-04-30` },
    { key: 'labour', name: 'Quốc tế Lao động 1/5', from: `${year}-05-01`, to: `${year}-05-01` },
    { key: 'national', name: 'Quốc khánh 2/9', from: `${year}-09-02`, to: `${year}-09-03`, note: '2 ngày' },
  ];
}
