// Tiện ích Excel dùng chung cho các API xuất / tải file .xlsx
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Dòng 1 = tiêu đề: chữ trắng đậm trên nền tối, cố định khi cuộn (tùy chọn bật bộ lọc)
function styleHeader(ws, { autoFilter = false, height = 30 } = {}) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2A3A' } };
  r.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  r.height = height;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (autoFilter) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
}

// Ghi workbook thẳng ra response dưới dạng file tải về
async function sendXlsx(res, wb, filename) {
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  await wb.xlsx.write(res);
  res.end();
}

// catch chung: lỗi trước khi gửi → JSON, lỗi giữa chừng → đóng response
function xlsxError(res, e) {
  if (!res.headersSent) res.status(500).json({ success: false, message: e.message });
  else res.end();
}

module.exports = { styleHeader, sendXlsx, xlsxError };
