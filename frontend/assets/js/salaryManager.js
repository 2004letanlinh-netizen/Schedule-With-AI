
// salaryManager.js
// Quản lý hiển thị trang Tính lương và Thống kê
(function () {
  const api = {
    salary: "/api/salary",
    stats: "/api/statistics",
  };

  function formatCurrency(v) {
    return new Intl.NumberFormat("vi-VN").format(v) + " VND";
  }

  function buildSalaryTable(entries) {
    if (!entries || entries.length === 0) {
      return `<div class="p-6">Không có dữ liệu</div>`;
    }

    let rows = entries
      .map((e) => {
        const date = e.date ? new Date(e.date).toLocaleDateString() : "";
        return `
        <tr class="border-t">
          <td class="px-4 py-3">${escapeHtml(e.title)}</td>
          <td class="px-4 py-3">${date}</td>
          <td class="px-4 py-3">${formatCurrency(e.rate)}</td>
          <td class="px-4 py-3">${e.hours} giờ</td>
          <td class="px-4 py-3">${escapeHtml(e.note)}</td>
        </tr>`;
      })
      .join("");

    return `
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <table class="w-full text-left table-auto">
          <thead>
            <tr class="bg-gray-50">
              <th class="px-4 py-3">Tên công việc</th>
              <th class="px-4 py-3">Ngày hoàn thành</th>
              <th class="px-4 py-3">Mức lương (VND)</th>
              <th class="px-4 py-3">Số giờ làm</th>
              <th class="px-4 py-3">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
  }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function loadSalary(from, to) {
    const token = localStorage.getItem("auth_token");
    const q = [];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    if (to) q.push(`to=${encodeURIComponent(to)}`);
    const url = api.salary + (q.length ? "?" + q.join("&") : "");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Không thể tải dữ liệu lương");
    return res.json();
  }

  async function loadStats(from, to) {
    const token = localStorage.getItem("auth_token");
    const q = [];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    if (to) q.push(`to=${encodeURIComponent(to)}`);
    const url = api.stats + (q.length ? "?" + q.join("&") : "");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Không thể tải dữ liệu thống kê");
    return res.json();
  }

  function renderSalary(container, data) {
    const entries = data.entries || [];
    const totalAmount = data.totalAmount || 0;

    container.innerHTML = `
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">Tính lương</h2>
          <p class="text-sm text-gray-600">Chọn mốc thời gian để tính lương</p>
        </div>
      </div>
      ${buildSalaryTable(entries)}
      <div class="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="text-right text-2xl font-bold">Tổng lương: ${formatCurrency(totalAmount)}</div>
      </div>
    `;
  }

  function renderStats(container, stats) {
    const { total, completed, pending, percent, daily } = stats;

    // Chart.js dynamic load
    if (!window.Chart) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.3.0/dist/chart.umd.min.js";
      script.onload = () => draw(stats, container);
      document.head.appendChild(script);
    } else {
      draw(stats, container);
    }
  }

  function draw(stats, container) {
    const { total, completed, pending, percent, daily } = stats;
    const labels = daily.map((d) => new Date(d.date).toLocaleDateString());
    const totals = daily.map((d) => d.total);
    const completedArr = daily.map((d) => d.completed);

    container.innerHTML = `
      <div class="mb-6">
        <h2 class="text-xl font-semibold">Thống kê công việc</h2>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white p-4 rounded border">Tổng số công việc: <strong>${total}</strong></div>
        <div class="bg-white p-4 rounded border">Đã hoàn thành: <strong>${completed}</strong></div>
        <div class="bg-white p-4 rounded border">Phần trăm hoàn thành: <strong>${percent}%</strong></div>
      </div>
      <div class="bg-white p-4 rounded border">
        <canvas id="stats-bar" height="120"></canvas>
      </div>
      <div class="mt-4 bg-white p-4 rounded border">
        <canvas id="stats-donut" height="120"></canvas>
      </div>
    `;

    // Bar chart
    const ctx = document.getElementById("stats-bar").getContext("2d");
    new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Tổng", data: totals, backgroundColor: "#60A5FA" },
          { label: "Hoàn thành", data: completedArr, backgroundColor: "#34D399" },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });

    // Donut
    const ctx2 = document.getElementById("stats-donut").getContext("2d");
    new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Hoàn thành", "Chưa hoàn thành"],
        datasets: [{ data: [completed, total - completed], backgroundColor: ["#60A5FA", "#C7D2FE"] }],
      },
      options: { responsive: true },
    });
  }

  // Khởi tạo khi trang sẵn sàng
  function init() {
    // Tìm container của trang salary (được tải qua component loader)
    const salaryContainer = document.getElementById("salary-container");
    const salaryContent = document.getElementById("salary-content");
    const salaryStatsContent = document.getElementById("salary-stats-content");

    // Default: load last 30 days
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // Load salary
    loadSalary(fromStr, toStr)
      .then((r) => {
        if (r.success) renderSalary(salaryContainer, r.data);
        else salaryContainer.innerHTML = `<div class=\"p-6\">Không có dữ liệu</div>`;
      })
      .catch((err) => {
        salaryContainer.innerHTML = `<div class=\"p-6 text-red-600\">${escapeHtml(err.message)}</div>`;
      });

    // Load stats
    loadStats(fromStr, toStr)
      .then((r) => {
        if (r.success) renderStats(salaryStatsContent, r.data);
        else salaryStatsContent.innerHTML = `<div class=\"p-6\">Không có dữ liệu</div>`;
      })
      .catch((err) => {
        salaryStatsContent.innerHTML = `<div class=\"p-6 text-red-600\">${escapeHtml(err.message)}</div>`;
      });

    // Tab switching (nếu có)
    const salaryTab = document.getElementById("salary-tab");
    const statsTab = document.getElementById("salary-stats-tab");
    if (salaryTab && statsTab) {
      const setActive = (activeBtn, inactiveBtn) => {
        // Active button styles
        activeBtn.classList.add("bg-blue-600");
        activeBtn.classList.remove("bg-gray-200");
        activeBtn.classList.add("text-white");
        activeBtn.classList.remove("text-gray-700");

        // Inactive button styles
        inactiveBtn.classList.remove("bg-blue-600");
        inactiveBtn.classList.add("bg-gray-200");
        inactiveBtn.classList.remove("text-white");
        inactiveBtn.classList.add("text-gray-700");
      };

      const show = (which) => {
        if (which === "salary") {
          salaryContainer.classList.remove("hidden");
          salaryStatsContent.classList.add("hidden");
          setActive(salaryTab, statsTab);
        } else {
          salaryContainer.classList.add("hidden");
          salaryStatsContent.classList.remove("hidden");
          setActive(statsTab, salaryTab);
        }
      };

      // Initialize visuals according to default
      show("salary");
      salaryTab.addEventListener("click", () => show("salary"));
      statsTab.addEventListener("click", () => show("stats"));
    }
  }

  // Expose init to global App if needed
  window.SalaryManager = { init };

  // Auto init with App lifecycle: try to init after DOM ready
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
/**
 * Salary Manager - Manages salary calculations and work shifts
 * WRAPPED VERSION: Prevents duplicate initialization
 */

(function () {
  "use strict";

  if (window.SalaryManager) {
    console.log("⏭️ SalaryManager already loaded");
    return;
  }

  window.SalaryManager = {
    initialized: false,
    eventListeners: [],

    async init() {
      if (this.initialized) {
        console.log("ℹ️ SalaryManager already initialized");
        return;
      }

      console.log("🚀 Initializing SalaryManager...");
      this.initialized = true;

      await this.loadSalaryData();
      this.bindEvents();

      console.log("✅ SalaryManager initialized successfully");
    },

    async loadSalaryData() {
      try {
        if (typeof Utils === "undefined") {
          console.warn("⚠️ Utils not available, using mock data");
          this.loadMockData();
          return;
        }

        const result = await Utils.makeRequest("/api/salary/data", "GET");

        if (!result.success) {
          throw new Error("Không tải được dữ liệu lương");
        }

        const data = result.data;

        // Cập nhật tên user
        const userNameElement = document.querySelector("[data-user-name]");
        if (userNameElement) {
          userNameElement.textContent = data.userInfo?.hoten || "Người dùng";
        }

        // Cập nhật lương giờ
        const luongGioEl = document.querySelector("#luong-gio");
        if (luongGioEl) {
          luongGioEl.textContent =
            new Intl.NumberFormat("vi-VN").format(data.luongTheoGio) + " đ/giờ";
        }

        // Load ca làm việc
        await this.loadWorkShifts();

        console.log("✅ Salary data loaded successfully");
      } catch (err) {
        console.error("❌ Error loading salary data:", err);
        if (typeof Utils !== "undefined" && Utils.showToast) {
          Utils.showToast("Lỗi tải lương: " + err.message, "error");
        }
        this.loadMockData();
      }
    },

    loadMockData() {
      // Load dữ liệu mẫu khi không có API
      const luongGioEl = document.querySelector("#luong-gio");
      if (luongGioEl) {
        luongGioEl.textContent = "29,000 đ/giờ";
      }
      this.loadWorkShifts();
    },

    async loadWorkShifts() {
      // Dữ liệu mẫu ca làm việc
      const sampleShifts = [
        {
          date: "26/05/2025",
          start: "08:00",
          end: "20:00",
          hours: "11 giờ",
          wage: "319,000",
          note: "Ca làm thêm",
        },
        {
          date: "25/05/2025",
          start: "08:00",
          end: "17:00",
          hours: "8 giờ",
          wage: "232,000",
          note: "Ca hành chính",
        },
      ];

      const container = document.getElementById("work-shifts-container");
      if (!container) {
        console.warn("⚠️ Work shifts container not found");
        return;
      }

      container.innerHTML = sampleShifts
        .map(
          (shift) => `
        <div class="grid grid-cols-[100px_100px_100px_120px_120px_1fr_100px] gap-4 text-xs py-2 border-b hover:bg-gray-50">
          <div class="text-center">${shift.date}</div>
          <div class="text-center">${shift.start}</div>
          <div class="text-center">${shift.end}</div>
          <div class="text-center">${shift.hours}</div>
          <div class="text-center font-medium">${shift.wage}</div>
          <div class="text-center text-gray-600">${shift.note}</div>
          <div class="text-center">
            <button onclick="SalaryManager.deleteShift('${shift.date}')" 
                    class="text-red-600 hover:text-red-800 text-xs">
              Xóa
            </button>
          </div>
        </div>
      `
        )
        .join("");

      console.log("✅ Work shifts rendered");
    },

    deleteShift(date) {
      if (confirm(`Bạn có chắc muốn xóa ca làm ngày ${date}?`)) {
        if (typeof Utils !== "undefined" && Utils.showToast) {
          Utils.showToast("Đã xóa ca làm việc", "success");
        }
        this.loadWorkShifts();
      }
    },

    bindEvents() {
      // Có thể thêm event cho các button tính lương tự động
      const calculateButton = document.getElementById("calculate-salary-btn");
      if (calculateButton) {
        const handler = () => this.calculateTotalSalary();
        calculateButton.addEventListener("click", handler);
        this.eventListeners.push({
          element: calculateButton,
          event: "click",
          handler,
        });
      }

      console.log("✅ SalaryManager events bound");
    },

    calculateTotalSalary() {
      // Logic tính tổng lương
      if (typeof Utils !== "undefined" && Utils.showToast) {
        Utils.showToast("Tính năng đang được phát triển", "info");
      }
    },

    cleanup() {
      console.log("🧹 Cleaning up SalaryManager...");

      this.eventListeners.forEach(({ element, event, handler }) => {
        if (element && element.removeEventListener) {
          element.removeEventListener(event, handler);
        }
      });

      this.eventListeners = [];
      this.initialized = false;

      console.log("✅ SalaryManager cleaned up");
    },
  };

  console.log("✅ SalaryManager loaded");
})();
