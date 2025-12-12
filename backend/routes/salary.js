const express = require("express");
const router = express.Router();
const { dbPoolPromise, sql } = require("../config/database");

// GET /api/salary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    const { from, to } = req.query;
    const endDate = to ? new Date(to) : new Date();
    const startDate = from ? new Date(from) : new Date(endDate.getTime() - 30 * 24 * 3600 * 1000);

    const pool = await dbPoolPromise;

    // Lấy các lịch đã hoàn thành trong khoảng, kèm thông tin công việc (LuongTheoGio)
    const result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("StartDate", sql.DateTime, startDate)
      .input("EndDate", sql.DateTime, endDate)
      .query(`
        SELECT
          lt.MaLichTrinh,
          lt.TieuDe AS LichTieuDe,
          lt.GioBatDau,
          lt.GioKetThuc,
          lt.GhiChu,
          lt.DaHoanThanh,
          cv.MaCongViec,
          cv.TieuDe AS CongViecTieuDe,
          cv.LuongTheoGio,
          cv.ThoiGianUocTinh
        FROM LichTrinh lt
        LEFT JOIN CongViec cv ON lt.MaCongViec = cv.MaCongViec
        WHERE lt.UserID = @UserID
          AND lt.DaHoanThanh = 1
          AND lt.GioKetThuc >= @StartDate
          AND lt.GioKetThuc <= @EndDate
        ORDER BY lt.GioKetThuc DESC
      `);

    const entries = result.recordset.map((r) => {
      // Tính số giờ: nếu có GioBatDau và GioKetThuc thì dùng diff, ngược lại dùng ThoiGianUocTinh (phút)
      let hours = 0;
      if (r.GioBatDau && r.GioKetThuc) {
        const start = new Date(r.GioBatDau);
        const end = new Date(r.GioKetThuc);
        hours = Math.round(((end - start) / (1000 * 60)) / 60 * 100) / 100; // giờ, 2 chữ số
      } else if (r.ThoiGianUocTinh) {
        hours = Math.round((r.ThoiGianUocTinh / 60) * 100) / 100;
      }

      const rate = r.LuongTheoGio ? parseFloat(r.LuongTheoGio) : 0;
      const amount = Math.round(hours * rate * 100) / 100;

      return {
        id: r.MaLichTrinh,
        title: r.CongViecTieuDe || r.LichTieuDe || "(Không có tiêu đề)",
        date: r.GioKetThuc || r.GioBatDau,
        rate,
        hours,
        note: r.GhiChu || "",
        amount,
      };
    });

    const totalAmount = entries.reduce((s, e) => s + (e.amount || 0), 0);

    res.json({ success: true, data: { entries, totalAmount } });
  } catch (error) {
    console.error("Lỗi salary:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

module.exports = router;