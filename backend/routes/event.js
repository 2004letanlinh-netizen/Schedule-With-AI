// Quản lý sự kiện

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { dbPoolPromise, sql } = require("../config/database");

router.use(authenticateToken);

router.get("/events", async (req, res) => {
  try {
    const userId = req.user.UserID;
    console.log(`📅 Fetching events for user: ${userId}`);

    const pool = await dbPoolPromise;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT 
          lt.MaLichTrinh AS ID,
          lt.MaCongViec,
          lt.UserID,
          lt.GioBatDau AS ThoiGianBatDau,
          lt.GioKetThuc AS ThoiGianKetThuc,
          lt.DaHoanThanh,
          lt.GhiChu,
          lt.AI_DeXuat,
          lt.NgayTao AS LichTrinhNgayTao,
          cv.TieuDe,
          cv.MoTa,
          cv.NgayTao AS CongViecNgayTao,
          cv.MauSac AS MaMau
        FROM LichTrinh lt
        LEFT JOIN CongViec cv ON lt.MaCongViec = cv.MaCongViec
        LEFT JOIN LoaiCongViec lc ON cv.MaLoai = lc.MaLoai
        WHERE lt.UserID = @userId AND lt.AI_DeXuat = 0
        ORDER BY lt.GioBatDau ASC
      `);

    console.log(` Found ${result.recordset.length} events for user ${userId}`);

    const events = result.recordset.map((ev) => {
      // Đảm bảo không có giá trị undefined
      const eventData = {
        ID: ev.ID || 0,
        title: ev.TieuDe || "Không có tiêu đề",
        TieuDe: ev.TieuDe || "Không có tiêu đề",
        start: ev.ThoiGianBatDau
          ? new Date(ev.ThoiGianBatDau).toISOString()
          : new Date().toISOString(),
        end: ev.ThoiGianKetThuc
          ? new Date(ev.ThoiGianKetThuc).toISOString()
          : null,
        ThoiGianBatDau: ev.ThoiGianBatDau,
        ThoiGianKetThuc: ev.ThoiGianKetThuc,
        backgroundColor: ev.MauSac || "#3788d8",
        MaMau: ev.MauSac || "#3788d8",
        extendedProps: {
          note: ev.GhiChu || "",
          completed: ev.DaHoanThanh || false,
          aiSuggested: ev.AI_DeXuat || false,
          taskId: ev.MaCongViec || null,
          description: ev.MoTa || "",
          created: ev.CongViecNgayTao || ev.LichTrinhNgayTao,
        },
      };

      return eventData;
    });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi tải lịch trình",
      error: error.message,
    });
  }
});

// ✅ POST /api/calendar/events - Tạo event mới - FIXED VERSION
router.post("/events", authenticateToken, async (req, res) => {
  // Thêm auth nếu chưa
  try {
    const userId = req.user.UserID;
    const {
      MaCongViec,
      GioBatDau,
      GioKetThuc,
      GhiChu,
      AI_DeXuat = false,
    } = req.body;

    if (!GioBatDau) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc",
      });
    }

    // ✅ FIX: Chuyển string sang Date object
    const startDate = new Date(GioBatDau);
    const endDate = GioKetThuc ? new Date(GioKetThuc) : null;

    // Kiểm tra date hợp lệ
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Định dạng ngày bắt đầu không hợp lệ",
      });
    }

    const pool = await dbPoolPromise;

    const result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("MaCongViec", sql.Int, MaCongViec)
      .input("GioBatDau", sql.DateTime, startDate) // Sử dụng Date
      .input("GioKetThuc", sql.DateTime, endDate) // Sử dụng Date
      .input("GhiChu", sql.NVarChar, GhiChu || null)
      .input("AI_DeXuat", sql.Bit, AI_DeXuat)
      .input("NgayTao", sql.DateTime, new Date()).query(`
        INSERT INTO LichTrinh (
          MaCongViec, UserID, GioBatDau, GioKetThuc, 
          DaHoanThanh, GhiChu, AI_DeXuat, NgayTao
        ) 
        OUTPUT INSERTED.MaLichTrinh
        VALUES (
          @MaCongViec, @UserID, @GioBatDau, @GioKetThuc, 
          0, @GhiChu, @AI_DeXuat, @NgayTao
        )
      `);

    // Cập nhật trạng thái công việc nếu cần
    if (MaCongViec) {
      await pool
        .request()
        .input("MaCongViec", sql.Int, MaCongViec)
        .input("UserID", sql.Int, userId).query(`
          UPDATE CongViec
          SET TrangThaiThucHien = 1  -- Đang thực hiện
          WHERE MaCongViec = @MaCongViec AND UserID = @UserID
        `);
    }

    res.json({
      success: true,
      data: {
        id: result.recordset[0].MaLichTrinh,
        message: "Tạo sự kiện thành công",
      },
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi tạo sự kiện",
      error: error.message,
    });
  }
});

// ✅ PUT /api/calendar/events/:id - Cập nhật event - FIXED VERSION
router.put("/events/:id", authenticateToken, async (req, res) => {
  // Thêm auth nếu chưa
  try {
    const userId = req.user.UserID;
    const eventId = req.params.id;
    const { ThoiGianBatDau, ThoiGianKetThuc, GhiChu, DaHoanThanh } = req.body;

    // ✅ FIX: Chuyển string sang Date
    const startDate = ThoiGianBatDau ? new Date(ThoiGianBatDau) : null;
    const endDate = ThoiGianKetThuc ? new Date(ThoiGianKetThuc) : null;

    const pool = await dbPoolPromise;

    await pool
      .request()
      .input("MaLichTrinh", sql.Int, eventId)
      .input("UserID", sql.Int, userId)
      .input("GioBatDau", sql.DateTime, startDate)
      .input("GioKetThuc", sql.DateTime, endDate)
      .input(
        "DaHoanThanh",
        sql.Bit,
        DaHoanThanh !== undefined ? DaHoanThanh : null
      )
      .input("GhiChu", sql.NVarChar, GhiChu || null).query(`
        UPDATE LichTrinh
        SET 
          GioBatDau = COALESCE(@GioBatDau, GioBatDau),
          GioKetThuc = COALESCE(@GioKetThuc, GioKetThuc),
          DaHoanThanh = COALESCE(@DaHoanThanh, DaHoanThanh),
          GhiChu = COALESCE(@GhiChu, GhiChu)
        WHERE MaLichTrinh = @MaLichTrinh AND UserID = @UserID
      `);

    // Cập nhật trạng thái công việc nếu hoàn thành
    if (DaHoanThanh !== undefined) {
      const eventResult = await pool
        .request()
        .input("MaLichTrinh", sql.Int, eventId)
        .input("UserID", sql.Int, userId).query(`
          SELECT MaCongViec FROM LichTrinh 
          WHERE MaLichTrinh = @MaLichTrinh AND UserID = @UserID
        `);

      const MaCongViec = eventResult.recordset[0]?.MaCongViec;

      if (MaCongViec) {
        await pool
          .request()
          .input("MaCongViec", sql.Int, MaCongViec)
          .input("TrangThaiThucHien", sql.TinyInt, DaHoanThanh ? 2 : 1)
          .input("UserID", sql.Int, userId).query(`
            UPDATE CongViec
            SET TrangThaiThucHien = @TrangThaiThucHien
            WHERE MaCongViec = @MaCongViec AND UserID = @UserID
          `);
      }
    }

    res.json({
      success: true,
      message: "Cập nhật sự kiện thành công",
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật sự kiện",
      error: error.message,
    });
  }
});

// ✅ DELETE /api/calendar/events/:id - Xóa event - FIXED VERSION
router.delete("/events/:id", async (req, res) => {
  try {
    const userId = req.user.UserID;
    const eventId = req.params.id;

    // ✅ FIX: Sử dụng dbPoolPromise
    const pool = await dbPoolPromise;

    // ✅ FIX: Lấy MaCongViec trước khi xóa
    const eventResult = await pool
      .request()
      .input("id", sql.Int, eventId)
      .input("userId", sql.Int, userId).query(`
        SELECT MaCongViec FROM LichTrinh 
        WHERE MaLichTrinh = @id AND UserID = @userId
      `);

    const MaCongViec = eventResult.recordset[0]?.MaCongViec;

    // Xóa lịch trình
    await pool
      .request()
      .input("id", sql.Int, eventId)
      .input("userId", sql.Int, userId)
      .query(
        "DELETE FROM LichTrinh WHERE MaLichTrinh = @id AND UserID = @userId"
      );

    // ✅ FIX: Cập nhật trạng thái công việc nếu có
    if (MaCongViec) {
      await pool
        .request()
        .input("MaCongViec", sql.Int, MaCongViec)
        .input("UserID", sql.Int, userId).query(`
          UPDATE CongViec
          SET TrangThaiThucHien = 0  -- Chờ thực hiện
          WHERE MaCongViec = @MaCongViec AND UserID = @UserID
        `);
    }

    res.json({
      success: true,
      message: "Xóa sự kiện thành công",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa sự kiện",
      error: error.message,
    });
  }
});

// ✅ GET /api/calendar/range - Lấy events trong khoảng thời gian
router.get("/range", async (req, res) => {
  try {
    const userId = req.user.UserID;
    const { start, end } = req.query;

    // ✅ FIX: Sử dụng dbPoolPromise
    const pool = await dbPoolPromise;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: "Thiếu tham số start hoặc end",
      });
    }

    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("start", sql.DateTime, start)
      .input("end", sql.DateTime, end).query(`
        SELECT 
          lt.MaLichTrinh,
          lt.MaCongViec,
          lt.UserID,
          lt.GioBatDau,
          lt.GioKetThuc,
          lt.DaHoanThanh,
          lt.GhiChu,
          lt.AI_DeXuat,
          lt.NgayTao AS LichTrinhNgayTao,
          cv.TieuDe,
          cv.MoTa,
          cv.NgayTao AS CongViecNgayTao,
          cv.MauSac
        FROM LichTrinh lt
        LEFT JOIN CongViec cv ON lt.MaCongViec = cv.MaCongViec
        LEFT JOIN LoaiCongViec lc ON cv.MaLoai = lc.MaLoai
        WHERE lt.UserID = @userId AND lt.AI_DeXuat = 0
        AND lt.GioBatDau >= @start 
        AND lt.GioBatDau <= @end
        ORDER BY lt.GioBatDau ASC
      `);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (error) {
    console.error("Error fetching events by range:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi tải lịch trình",
      error: error.message,
    });
  }
});

// Đảm bảo endpoint này đã có trong event.js
router.get("/ai-events", async (req, res) => {
  try {
    const userId = req.user.UserID;
    console.log(`🤖 Fetching AI events for user: ${userId}`);

    const pool = await dbPoolPromise;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT 
          lt.MaLichTrinh AS ID,
          lt.MaCongViec,
          lt.UserID,
          lt.GioBatDau AS ThoiGianBatDau,
          lt.GioKetThuc AS ThoiGianKetThuc,
          lt.DaHoanThanh,
          lt.GhiChu,
          lt.AI_DeXuat,
          lt.NgayTao AS LichTrinhNgayTao,
          cv.TieuDe,
          cv.MoTa,
          cv.NgayTao AS CongViecNgayTao,
          cv.MauSac AS Color,
          cv.MucDoUuTien
        FROM LichTrinh lt
        LEFT JOIN CongViec cv ON lt.MaCongViec = cv.MaCongViec
        WHERE lt.UserID = @userId 
          AND lt.AI_DeXuat = 1  -- CHỈ LẤY AI SUGGESTIONS
        ORDER BY lt.GioBatDau ASC
      `);

    console.log(
      `🤖 Found ${result.recordset.length} AI events for user ${userId}`
    );

    const events = result.recordset.map((ev) => {
      return {
        ID: ev.ID || 0,
        MaLichTrinh: ev.ID,
        TieuDe: ev.TieuDe || "AI Đề xuất",
        title: ev.TieuDe || "AI Đề xuất",
        GioBatDau: ev.ThoiGianBatDau,
        GioKetThuc: ev.ThoiGianKetThuc,
        ThoiGianBatDau: ev.ThoiGianBatDau,
        ThoiGianKetThuc: ev.ThoiGianKetThuc,
        DaHoanThanh: ev.DaHoanThanh,
        GhiChu: ev.GhiChu || "",
        AI_DeXuat: ev.AI_DeXuat,
        Color: ev.Color || "#8B5CF6",
        backgroundColor: ev.Color || "#8B5CF6",
        priority: ev.MucDoUuTien || 2,
        extendedProps: {
          note: ev.GhiChu || "",
          completed: ev.DaHoanThanh || false,
          aiSuggested: true, // Đánh dấu đây là AI suggestion
          taskId: ev.MaCongViec || null,
          description: ev.MoTa || "",
          created: ev.CongViecNgayTao || ev.LichTrinhNgayTao,
        },
      };
    });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching AI events:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi tải lịch trình AI",
      error: error.message,
    });
  }
});

module.exports = router;
