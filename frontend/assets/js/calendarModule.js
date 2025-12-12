(function () {
  "use strict";

  if (window.CalendarModule) {
    console.warn("CalendarModule already exists → destroying old instance");
    window.CalendarModule.destroy?.();
  }

  const CalendarModule = {
    calendar: null,
    draggableInstance: null,
    isInitialized: false,
    initPromise: null,
    currentView: "timeGridWeek",
    isDragging: false,

    // ==========================================================
    // PUBLIC: init()
    // ==========================================================
    async init() {
      if (this.isInitialized && this.calendar) this.destroy();

      console.log("Khởi tạo CalendarModule v6.5 FIXED...");

      try {
        await this._initInternal();
        this.isInitialized = true;
        console.log("CalendarModule v6.5 FIXED khởi tạo thành công!");
      } catch (err) {
        console.error("Calendar initialization failed:", err);
        this.showError(err);
      }
    },

    // ==========================================================
    // PRIVATE: _initInternal()
    // ==========================================================
    async _initInternal() {
      const calendarEl = await this.waitForElement("calendar", 8000);
      if (!calendarEl) throw new Error("Không tìm thấy phần tử #calendar");

      await Promise.all([this.waitForFullCalendar(), this.waitForUtils()]);
      calendarEl.style.minHeight = "700px";

      const events = await this.loadEvents();
      this.renderCalendar(events);

      // Setup cả hai phương thức kéo thả
      setTimeout(() => {
        this.setupExternalDraggable();
        this.setupNativeDragDrop();
        this.initializeNavbarEvents();
      }, 500);
    },

    // ==========================================================
    // UTILS (giữ nguyên)
    // ==========================================================
    waitForElement(id, timeout = 8000) {
      return new Promise((resolve) => {
        const el = document.getElementById(id);
        if (el) return resolve(el);

        const observer = new MutationObserver(() => {
          const el = document.getElementById(id);
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeout);
      });
    },

    waitForFullCalendar(timeout = 10000) {
      return new Promise((resolve, reject) => {
        if (typeof FullCalendar !== "undefined") return resolve();

        const start = Date.now();
        const check = () => {
          if (typeof FullCalendar !== "undefined") resolve();
          else if (Date.now() - start > timeout)
            reject(new Error("FullCalendar timeout"));
          else setTimeout(check, 100);
        };
        check();
      });
    },

    waitForUtils() {
      return new Promise((resolve) => {
        if (typeof Utils !== "undefined") return resolve();
        const check = () =>
          typeof Utils !== "undefined" ? resolve() : setTimeout(check, 100);
        check();
      });
    },

    showError(error) {
      const el = document.getElementById("calendar");
      if (!el) return;

      el.innerHTML = `
        <div class="flex items-center justify-center h-96">
          <div class="text-center p-10 bg-red-50 rounded-xl">
            <div class="text-6xl mb-4">Lỗi</div>
            <h3 class="text-2xl font-bold text-red-700 mb-3">Không tải được lịch</h3>
            <p class="text-gray-600 mb-6">${error.message || error}</p>
            <button onclick="location.reload()" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Tải lại trang
            </button>
          </div>
        </div>
      `;
    },

    // ==========================================================
    // LOAD EVENTS FROM SERVER - FIXED FIELD NAMES
    // ==========================================================
    // SỬA FILE: calendarModule.js - HÀM loadEvents()
    async loadEvents() {
      if (!Utils?.makeRequest) {
        console.warn("Utils.makeRequest không tồn tại → trả về mảng rỗng");
        return [];
      }

      try {
        const res = await Utils.makeRequest("/api/calendar/events", "GET");
        if (!res.success || !Array.isArray(res.data)) return [];

        // ✅ THÊM FILTER ĐỂ LOẠI BỎ AI EVENTS KHỎI LỊCH THƯỜNG
        const normalEvents = res.data.filter((ev) => {
          const isAI =
            ev.AI_DeXuat === 1 ||
            ev.extendedProps?.aiSuggested === true ||
            ev.isAISuggestion === true;
          return !isAI; // Chỉ lấy events không phải AI
        });

        return normalEvents.map((ev) => ({
          id: ev.id || ev.MaLichTrinh || 0,
          title: ev.title || ev.TieuDe || "Không tiêu đề",
          start: ev.start || ev.GioBatDau || new Date().toISOString(),
          end: ev.end || ev.GioKetThuc || null,
          backgroundColor: ev.backgroundColor || ev.MauSac || "#3788d8",
          borderColor: ev.borderColor || ev.MauSac || "#3788d8",
          allDay: ev.allDay || false,
          extendedProps: {
            note: ev.GhiChu || ev.extendedProps?.note || "",
            completed:
              ev.DaHoanThanh === 1 || ev.extendedProps?.completed || false,
            taskId: ev.MaCongViec || ev.extendedProps?.taskId || null,
            isFromDrag: ev.isFromDrag || false,
            // ✅ THÊM FLAG ĐỂ PHÂN BIỆT AI/THƯỜNG
            isAIEvent:
              ev.AI_DeXuat === 1 || ev.extendedProps?.aiSuggested || false,
          },
        }));
      } catch (err) {
        console.error("Load events error:", err);
        return [];
      }
    },

    // ==========================================================
    // RENDER CALENDAR - FIXED EVENT HANDLERS
    // ==========================================================
    renderCalendar(events) {
      const el = document.getElementById("calendar");
      if (!el) return;

      // Destroy old calendar
      if (this.calendar) {
        try {
          this.calendar.destroy();
        } catch (e) {}
        this.calendar = null;
      }
      el.innerHTML = "";

      this.calendar = new FullCalendar.Calendar(el, {
        initialView: this.currentView,
        locale: "vi",
        height: "100%",
        editable: true,
        droppable: true,
        selectable: true,
        selectMirror: true,
        dayMaxEvents: true,
        headerToolbar: false,
        nowIndicator: true,
        events: events,

        slotMinTime: "06:00:00",
        slotMaxTime: "23:00:00",
        slotDuration: "00:30:00",
        scrollTime: "08:00:00",

        buttonText: {
          today: "Hôm nay",
          month: "Tháng",
          week: "Tuần",
          day: "Ngày",
          list: "Danh sách",
        },
        allDayText: "Cả ngày",
        moreLinkText: (n) => `+ ${n} thêm`,
        noEventsText: "Không có sự kiện",

        // ===== FIXED: Sử dụng arrow functions để giữ context =====
        eventReceive: async (info) => {
          await this._handleEventReceive(info);
        },

        eventDrop: async (info) => {
          await this._handleEventUpdate(info);
        },

        eventResize: async (info) => {
          await this._handleEventUpdate(info);
        },

        eventClick: (info) => {
          info.jsEvent.preventDefault();
          this._showEventDetails(info.event);
        },

        datesSet: () => this.updateCalendarTitle(),

        eventDidMount: (info) => {
          const el = info.el;
          el.style.cursor = "pointer";

          if (info.event.extendedProps.completed) {
            el.classList.add("event-completed");
            el.style.opacity = "0.7";
          }

          const start =
            info.event.start?.toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }) || "";
          const end =
            info.event.end?.toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }) || "";
          el.title = `${info.event.title}\n${start} - ${end}`;
        },

        views: {
          dayGridMonth: { dayMaxEventRows: 4 },
          timeGridWeek: { slotDuration: "00:30:00" },
          timeGridDay: { slotDuration: "00:15:00" },
        },
      });

      this.calendar.render();
      window.calendar = this.calendar;
      this.updateCalendarTitle();
      console.log("FullCalendar đã render thành công");
    },

    // ==========================================================
    // TIME CONFLICT CHECK
    // ==========================================================
    hasTimeConflict(newEvent) {
      const events = this.calendar.getEvents();
      const s1 = newEvent.start;
      const e1 = newEvent.end || new Date(s1.getTime() + 3600000);

      for (const ev of events) {
        if (ev.id === newEvent.id) continue;
        const s2 = ev.start;
        const e2 = ev.end || new Date(s2.getTime() + 3600000);

        // Kiểm tra overlap
        if (s1 < e2 && e1 > s2) {
          console.log(`⛔ Overlap detected with event: "${ev.title}"`);
          console.log(
            `   New event: ${s1.toLocaleString()} - ${e1.toLocaleString()}`
          );
          console.log(
            `   Existing:  ${s2.toLocaleString()} - ${e2.toLocaleString()}`
          );
          return true;
        }
      }
      return false;
    },

    // ==========================================================
    // EVENT RECEIVE (drag from task list) - FIXED
    // ==========================================================
    async _handleEventReceive(info) {
      try {
        console.log("🎯 Event received from drag & drop:", info);

        // Check time conflict
        if (this.hasTimeConflict(info.event)) {
          Utils.showToast?.("⛔ Thời gian này đã có sự kiện khác!", "error");
          info.event.remove();
          return;
        }

        const taskId =
          info.draggedEl?.dataset?.taskId ||
          info.dragInfo?.draggedEl?.dataset?.taskId ||
          info.event.extendedProps?.taskId;

        let taskTitle = info.event.title || "Công việc mới";

        // Nếu có taskId, lấy thông tin từ server
        if (taskId) {
          try {
            // Hiển thị loading thông báo
            Utils.showToast?.("🔄 Đang thêm vào lịch...", "info");

            // THỬ CÁC ENDPOINT KHÁC NHAU:
            let taskData = null;

            // CÁCH 1: Gọi API lấy tất cả tasks rồi filter
            const allTasks = await Utils.makeRequest("/api/tasks", "GET");
            if (allTasks.success && Array.isArray(allTasks.data)) {
              taskData = allTasks.data.find(
                (task) =>
                  task.ID == taskId ||
                  task.MaCongViec == taskId ||
                  task.id == taskId
              );
            }

            // CÁCH 2: Nếu cách 1 không tìm thấy, thử endpoint khác
            if (!taskData) {
              try {
                const singleTask = await Utils.makeRequest(
                  `/api/tasks/${taskId}`,
                  "GET"
                );
                if (singleTask.success && singleTask.data) {
                  taskData = singleTask.data;
                }
              } catch (singleTaskErr) {
                console.log("Endpoint /api/tasks/${taskId} không khả dụng");
              }
            }

            // CÁCH 3: Thử với query parameter
            if (!taskData) {
              try {
                const queryTask = await Utils.makeRequest(
                  `/api/tasks?id=${taskId}`,
                  "GET"
                );
                if (queryTask.success && queryTask.data) {
                  taskData = Array.isArray(queryTask.data)
                    ? queryTask.data[0]
                    : queryTask.data;
                }
              } catch (queryErr) {
                console.log("Endpoint /api/tasks?id=${taskId} không khả dụng");
              }
            }

            if (taskData) {
              taskTitle = taskData.TieuDe || taskData.title || taskTitle;
            }
          } catch (err) {
            console.warn(
              "Không thể lấy thông tin task, sử dụng tiêu đề mặc định:",
              err.message
            );
            // Vẫn tiếp tục với tiêu đề mặc định
          }
        }

        // Tạo event data với field names ĐÚNG theo backend (calendar.js)
        const eventData = {
          TieuDe: taskTitle,
          GioBatDau: info.event.start.toISOString(),
          GioKetThuc: info.event.end
            ? info.event.end.toISOString()
            : new Date(
                info.event.start.getTime() + 60 * 60 * 1000
              ).toISOString(),
          GhiChu: `Tạo từ công việc: ${taskTitle}`,
          MaCongViec: taskId ? parseInt(taskId) : null,
          DaHoanThanh: 0,
          AI_DeXuat: 0,
        };

        console.log("📤 Creating event from drag & drop:", eventData);

        // Gọi API tạo event
        const result = await Utils.makeRequest(
          "/api/calendar/events",
          "POST",
          eventData
        );

        if (!result.success) {
          throw new Error(result.message || "Tạo sự kiện thất bại");
        }

        // Cập nhật ID cho event trên calendar
        const newEventId =
          result.eventId || result.data?.id || result.data?.MaLichTrinh;
        if (newEventId) {
          info.event.setProp("id", newEventId);
        }
        info.event.setExtendedProp("taskId", taskId ? parseInt(taskId) : null);
        info.event.setExtendedProp("isFromDrag", true);

        // Thông báo thành công với biểu tượng
        Utils.showToast?.("✅ Đã thêm vào lịch thành công!", "success");

        // Thêm hiệu ứng visual cho event mới
        setTimeout(() => {
          const eventElement = document.querySelector(
            `[data-event-id="${newEventId}"]`
          );
          if (eventElement) {
            eventElement.classList.add("animate-pulse");
            setTimeout(() => {
              eventElement.classList.remove("animate-pulse");
            }, 2000);
          }
        }, 100);

        console.log("✅ Event created successfully:", result);
      } catch (error) {
        console.error("❌ Error in eventReceive:", error);

        // Thông báo lỗi chi tiết
        let errorMessage = "Lỗi khi thêm vào lịch";
        if (
          error.message.includes("conflict") ||
          error.message.includes("trùng")
        ) {
          errorMessage = "⛔ Thời gian này đã có sự kiện khác!";
        } else if (
          error.message.includes("validation") ||
          error.message.includes("validate")
        ) {
          errorMessage = "⚠️ Dữ liệu không hợp lệ!";
        } else {
          errorMessage = error.message || "Lỗi khi thêm vào lịch";
        }

        Utils.showToast?.(errorMessage, "error");
        info.event.remove();
      }
    },

    // ==========================================================
    // EVENT UPDATE (move / resize) - FIXED FIELD NAMES
    // ==========================================================
    async _handleEventUpdate(info) {
      try {
        console.log("🔄 Event updated:", info.event);

        const eventId = info.event.id;
        if (!eventId) {
          throw new Error("Event không có ID");
        }

        const newStart = info.event.start;
        const newEnd =
          info.event.end || new Date(newStart.getTime() + 60 * 60 * 1000);

        // Kiểm tra trùng lịch (loại trừ chính nó)
        if (this.hasTimeConflict(info.event)) {
          Utils.showToast?.("⛔ Thời gian này đã có sự kiện khác!", "error");
          info.revert();
          return;
        }

        // Hiển thị loading thông báo
        Utils.showToast?.("🔄 Đang cập nhật thời gian...", "info");

        // Sử dụng field names ĐÚNG theo backend calendar.js
        const updateData = {
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
        };

        console.log(`📤 Updating event ${eventId}:`, updateData);

        const result = await Utils.makeRequest(
          `/api/calendar/events/${eventId}`,
          "PUT",
          updateData
        );

        if (!result.success) {
          throw new Error(result.message || "Cập nhật thất bại");
        }

        // Thông báo thành công
        Utils.showToast?.("✅ Đã cập nhật thời gian sự kiện", "success");

        // Hiệu ứng visual cho event vừa cập nhật
        const eventElement = document.querySelector(
          `[data-event-id="${eventId}"]`
        );
        if (eventElement) {
          eventElement.classList.add("bg-green-50", "border-green-200");
          setTimeout(() => {
            eventElement.classList.remove("bg-green-50", "border-green-200");
          }, 1500);
        }

        console.log("✅ Event updated successfully");
      } catch (error) {
        console.error("❌ Error in eventUpdate:", error);

        // Thông báo lỗi chi tiết
        let errorMessage = "Lỗi khi cập nhật thời gian";
        if (
          error.message.includes("conflict") ||
          error.message.includes("trùng")
        ) {
          errorMessage =
            "⛔ Không thể di chuyển: Thời gian đã có sự kiện khác!";
        } else if (error.message.includes("validation")) {
          errorMessage = "⚠️ Thời gian không hợp lệ!";
        } else {
          errorMessage = error.message || "Lỗi khi cập nhật thời gian";
        }

        Utils.showToast?.(errorMessage, "error");
        info.revert();
      }
    },

    // ==========================================================
    // SETUP NATIVE DRAG & DROP (từ phiên bản cũ)
    // ==========================================================
    setupNativeDragDrop() {
      console.log("🔍 Searching for draggable items...");

      // TÌM TASK TỪ NHIỀU NGUỒN
      const selectors = [
        // Từ work section
        "#work-items-container .work-item",
        "#work-items-container [draggable='true']",
        "#work-items-container [data-task-id]",

        // Từ calendar sidebar
        "#task-list div[draggable='true']",
        "#task-list > div",
        "#task-list [data-task-id]",

        // General selectors
        ".work-item",
        "[draggable='true']",
        "[data-task-id]",
      ];

      let foundItems = [];

      // Tìm tất cả items
      selectors.forEach((selector) => {
        try {
          const items = document.querySelectorAll(selector);
          if (items.length > 0) {
            console.log(
              `📦 Found ${items.length} items with selector: ${selector}`
            );
            items.forEach((item) => {
              // Kiểm tra không trùng và có data-task-id
              if (!foundItems.includes(item) && item.dataset.taskId) {
                foundItems.push(item);
              }
            });
          }
        } catch (e) {
          console.warn(`Error with selector ${selector}:`, e);
        }
      });

      console.log(`🎯 Total draggable items found: ${foundItems.length}`);

      if (foundItems.length === 0) {
        console.warn("⚠️ No draggable items found!");
        return;
      }

      // Áp dụng drag events
      foundItems.forEach((item) => {
        const hasListener = item.getAttribute("data-drag-initialized");
        if (hasListener) return;

        item.setAttribute("draggable", "true");
        item.setAttribute("data-drag-initialized", "true");

        // Drag start
        // Drag start - thêm hiệu ứng
        item.addEventListener("dragstart", (e) => {
          this.isDragging = true;
          const taskId = item.dataset.taskId;
          const taskTitle = item.dataset.taskTitle || "Công việc";

          console.log(`🔄 Drag started for task ${taskId}: ${taskTitle}`);

          // Set data
          e.dataTransfer.setData("text/plain", taskId);
          e.dataTransfer.setData(
            "application/json",
            JSON.stringify({
              taskId: taskId,
              title: taskTitle,
              color: item.dataset.taskColor || "#3B82F6",
            })
          );
          e.dataTransfer.effectAllowed = "move";

          // Visual feedback cho task đang kéo
          item.classList.add("dragging-task");

          // Thông báo đang kéo
          Utils.showToast?.(`📤 Đang kéo: "${taskTitle}"`, "info");
        });

        // Drag end
        item.addEventListener("dragend", () => {
          this.isDragging = false;
          item.classList.remove("dragging-task");
          console.log("🔄 Drag ended");
        });

        // Drag end
        item.addEventListener("dragend", () => {
          this.isDragging = false;
          item.classList.remove("opacity-50", "scale-95");
          console.log("🔄 Drag ended");
        });
      });

      console.log(`✅ Setup drag for ${foundItems.length} items`);
    },

    linkWorkTasksToCalendar() {
      console.log("🔗 Linking work tasks to calendar drag & drop...");

      // Đảm bảo các tasks trong work section có đủ attributes cho drag
      const workTasks = document.querySelectorAll(
        "#work-items-container .work-item"
      );

      workTasks.forEach((task) => {
        const taskId = task.dataset.taskId;
        if (taskId) {
          // Thêm attributes cần thiết nếu chưa có
          if (!task.hasAttribute("draggable")) {
            task.setAttribute("draggable", "true");
          }

          if (!task.dataset.taskTitle) {
            const titleEl = task.querySelector("h4");
            if (titleEl) {
              task.dataset.taskTitle = titleEl.textContent.trim();
            }
          }

          if (!task.dataset.taskColor) {
            const borderLeft =
              task.style.borderLeftColor ||
              getComputedStyle(task).borderLeftColor;
            task.dataset.taskColor = borderLeft || "#3B82F6";
          }
        }
      });

      // Refresh drag & drop
      this.setupNativeDragDrop();
    },

    refreshDragDrop() {
      console.log("🔄 Refreshing drag & drop...");
      setTimeout(() => {
        this.setupNativeDragDrop();
        this.setupExternalDraggable();
      }, 100);
    },

    // ==========================================================
    // SHOW EVENT DETAILS MODAL - SIMPLIFIED VERSION
    // ==========================================================
    // ==========================================================
    // SHOW EVENT DETAILS MODAL - WITH DELETE BUTTON
    // ==========================================================
    // ==========================================================
    // SHOW EVENT DETAILS MODAL - WITH DANGER ZONE DELETE
    // ==========================================================
    _showEventDetails(event) {
      const p = event.extendedProps;
      const startStr = event.start
        ? event.start.toLocaleString("vi-VN")
        : "N/A";
      const endStr = event.end ? event.end.toLocaleString("vi-VN") : "N/A";

      // Format thời gian cho cảnh báo
      const dateStr = event.start
        ? event.start.toLocaleDateString("vi-VN")
        : "";
      const timeStr = event.start
        ? event.start.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

      const modalHtml = `
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="eventDetailModal">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <!-- Header với tiêu đề và ID -->
          <div class="flex justify-between items-start mb-5">
            <h3 class="text-2xl font-bold text-gray-800">${event.title}</h3>
            <span class="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">ID: ${
              event.id || "Tạm thời"
            }</span>
          </div>
          
          <!-- Thông tin chi tiết -->
          <div class="space-y-4 mb-6">
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h4 class="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <i class="fas fa-info-circle"></i> Thông tin sự kiện
              </h4>
              <div class="space-y-2">
                <div class="flex">
                  <span class="w-32 text-gray-600 font-medium">Thời gian:</span>
                  <span>${dateStr} ${timeStr}</span>
                </div>
                <div class="flex">
                  <span class="w-32 text-gray-600 font-medium">Khoảng thời gian:</span>
                  <span>${startStr} → ${endStr}</span>
                </div>
                <div class="flex">
                  <span class="w-32 text-gray-600 font-medium">Ghi chú:</span>
                  <span class="flex-1">${p.note || "Không có ghi chú"}</span>
                </div>
                <div class="flex">
                  <span class="w-32 text-gray-600 font-medium">Trạng thái:</span>
                  <span class="${
                    p.completed
                      ? "text-green-600 font-semibold"
                      : "text-orange-600 font-semibold"
                  } flex items-center gap-2">
                    ${
                      p.completed
                        ? '<i class="fas fa-check-circle"></i> Đã hoàn thành'
                        : '<i class="fas fa-clock"></i> Chưa hoàn thành'
                    }
                  </span>
                </div>
                ${
                  p.taskId
                    ? `
                <div class="flex">
                  <span class="w-32 text-gray-600 font-medium">Liên kết công việc:</span>
                  <span class="text-blue-600 font-medium">
                    <i class="fas fa-link"></i> Công việc #${p.taskId}
                  </span>
                </div>
                `
                    : ""
                }
              </div>
            </div>

            <!-- Toggle hoàn thành -->
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" id="eventCompletedCheckbox" 
                       class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                       ${p.completed ? "checked" : ""}>
                <span class="text-lg font-medium">Đánh dấu đã hoàn thành</span>
              </label>
              <p class="text-sm text-gray-500 mt-2">
                ${
                  p.completed
                    ? "Sự kiện đã hoàn thành sẽ được ẩn khỏi lịch sau 1 giây"
                    : "Đánh dấu hoàn thành sẽ tự động xóa sự kiện khỏi lịch"
                }
              </p>
            </div>

            <!-- KHU VỰC NGUY HIỂM - XÓA SỰ KIỆN -->
            <div class="p-4 bg-red-50 rounded-lg border border-red-200">
              <h4 class="font-semibold text-red-800 mb-3 flex items-center gap-2">
                <i class="fas fa-exclamation-triangle"></i> Khu vực nguy hiểm
              </h4>
              
              <!-- Cảnh báo xóa -->
              <div class="mb-4">
                <p class="text-red-700 mb-2 font-medium">Xóa vĩnh viễn sự kiện này?</p>
                <div class="space-y-2 text-sm text-red-600">
                  <p class="flex items-start gap-2">
                    <i class="fas fa-times-circle mt-0.5"></i>
                    <span>Sự kiện sẽ bị xóa hoàn toàn khỏi hệ thống</span>
                  </p>
                  <p class="flex items-start gap-2">
                    <i class="fas fa-history mt-0.5"></i>
                    <span>Không thể khôi phục sau khi xóa</span>
                  </p>
                  ${
                    p.taskId
                      ? `
                  <p class="flex items-start gap-2">
                    <i class="fas fa-unlink mt-0.5"></i>
                    <span>Chỉ xóa sự kiện lịch trình, không xóa công việc gốc</span>
                  </p>
                  `
                      : ""
                  }
                </div>
              </div>

              <!-- Nút xóa với xác nhận kép -->
              <div class="space-y-3">
                <button id="showDeleteConfirmBtn" 
                        class="w-full px-4 py-3 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                  <i class="fas fa-trash"></i>
                  Xóa sự kiện
                </button>
                
                <!-- Xác nhận xóa (ẩn ban đầu) -->
                <div id="deleteConfirmation" class="hidden space-y-3">
                  <div class="p-3 bg-red-100 border border-red-300 rounded-lg">
                    <p class="text-red-800 font-semibold text-center mb-2">Xác nhận xóa?</p>
                    <p class="text-sm text-red-700 text-center">
                      Nhập "<span class="font-bold">${event.title.substring(
                        0,
                        20
                      )}</span>" để xác nhận
                    </p>
                  </div>
                  
                  <div class="space-y-3">
                    <input type="text" 
                           id="deleteConfirmInput" 
                           class="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500" 
                           placeholder="Nhập tiêu đề sự kiện để xác nhận">
                    
                    <div class="flex gap-3">
                      <button id="cancelDeleteBtn" 
                              class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg font-medium transition">
                        Hủy bỏ
                      </button>
                      <button id="confirmDeleteBtn" 
                              class="flex-1 px-4 py-2 bg-red-700 text-white hover:bg-red-800 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled>
                        <i class="fas fa-skull-crossbones mr-2"></i>
                        Xóa vĩnh viễn
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button id="closeEventDetail" 
                    class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition">
              Đóng
            </button>
            <button id="saveEventStatus" 
                    class="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">
              <i class="fas fa-save mr-2"></i>
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>`;

      // Remove old modal
      document.getElementById("eventDetailModal")?.remove();
      document.body.insertAdjacentHTML("beforeend", modalHtml);

      // Event listeners
      document.getElementById("closeEventDetail").onclick = () =>
        document.getElementById("eventDetailModal").remove();

      document.getElementById("saveEventStatus").onclick = () =>
        this._updateEventStatus(event);

      // Xử lý xóa với xác nhận kép
      const deleteBtn = document.getElementById("showDeleteConfirmBtn");
      const deleteConfirmation = document.getElementById("deleteConfirmation");
      const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
      const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
      const deleteConfirmInput = document.getElementById("deleteConfirmInput");

      deleteBtn.addEventListener("click", () => {
        deleteConfirmation.classList.remove("hidden");
        deleteBtn.classList.add("hidden");
      });

      cancelDeleteBtn.addEventListener("click", () => {
        deleteConfirmation.classList.add("hidden");
        deleteBtn.classList.remove("hidden");
        deleteConfirmInput.value = "";
        confirmDeleteBtn.disabled = true;
      });

      // Kiểm tra input xác nhận
      deleteConfirmInput.addEventListener("input", (e) => {
        const inputText = e.target.value.trim();
        const eventTitleShort = event.title.substring(0, 20);

        confirmDeleteBtn.disabled = inputText !== eventTitleShort;

        if (inputText === eventTitleShort) {
          confirmDeleteBtn.classList.remove("bg-red-700");
          confirmDeleteBtn.classList.add("bg-red-800", "animate-pulse");
        } else {
          confirmDeleteBtn.classList.remove("bg-red-800", "animate-pulse");
          confirmDeleteBtn.classList.add("bg-red-700");
        }
      });

      // Xác nhận xóa
      confirmDeleteBtn.addEventListener("click", () => {
        if (deleteConfirmInput.value.trim() === event.title.substring(0, 20)) {
          this._deleteEvent(event);
        }
      });

      // Cho phép Enter để xác nhận
      deleteConfirmInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !confirmDeleteBtn.disabled) {
          confirmDeleteBtn.click();
        }
      });
    },

    // ==========================================================
    // DELETE EVENT WITH EXTRA CONFIRMATION
    // ==========================================================
    async _deleteEvent(event) {
      const eventId = event.id;

      if (!eventId || eventId.toString().startsWith("temp-")) {
        Utils.showToast?.("⚠️ Sự kiện chưa được lưu vào database", "warning");
        document.getElementById("eventDetailModal")?.remove();
        event.remove();
        return;
      }

      try {
        // Hiệu ứng loading cho nút xóa
        const confirmBtn = document.getElementById("confirmDeleteBtn");
        const originalText = confirmBtn.innerHTML;
        confirmBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin mr-2"></i> Đang xóa...';
        confirmBtn.disabled = true;

        // Gọi API xóa sự kiện
        const result = await Utils.makeRequest(
          `/api/calendar/events/${eventId}`,
          "DELETE"
        );

        if (!result.success) {
          // Kiểm tra nếu có lỗi liên quan đến task
          if (
            (result.message && result.message.includes("liên quan")) ||
            result.message.includes("task")
          ) {
            throw new Error(
              "Sự kiện đang liên kết với công việc. Vui lòng kiểm tra lại."
            );
          }
          throw new Error(result.message || "Xóa sự kiện thất bại");
        }

        // Hiệu ứng visual trước khi xóa
        const modal = document.getElementById("eventDetailModal");
        if (modal) {
          modal.style.animation = "fadeOut 0.3s ease forwards";
          setTimeout(() => modal.remove(), 300);
        }

        // Hiệu ứng cho event trong calendar
        const eventEl =
          document.querySelector(`[data-event-id="${eventId}"]`) ||
          document.querySelector(
            `.fc-event[title*="${event.title.substring(0, 20)}"]`
          );

        if (eventEl) {
          eventEl.style.animation = "shrinkOut 0.5s ease forwards";
          eventEl.style.transformOrigin = "center";
          setTimeout(() => {
            event.remove();
          }, 500);
        } else {
          event.remove();
        }

        // Thông báo thành công với hiệu ứng
        Utils.showToast?.("🗑️ Đã xóa sự kiện thành công!", "success");

        console.log(`✅ Event ${eventId} deleted successfully`);

        // Dispatch event để các component khác biết
        document.dispatchEvent(
          new CustomEvent("eventDeleted", {
            detail: { eventId, eventTitle: event.title },
          })
        );
      } catch (error) {
        console.error("❌ Error deleting event:", error);

        // Khôi phục nút xóa
        const confirmBtn = document.getElementById("confirmDeleteBtn");
        if (confirmBtn) {
          confirmBtn.innerHTML = originalText;
          confirmBtn.disabled = false;
        }

        let errorMessage = "Lỗi khi xóa sự kiện";
        if (
          error.message.includes("liên kết") ||
          error.message.includes("task")
        ) {
          errorMessage = "⛔ " + error.message;
        } else if (
          error.message.includes("database") ||
          error.message.includes("ID hợp lệ")
        ) {
          errorMessage = "⚠️ " + error.message;
        } else {
          errorMessage = error.message || "Lỗi khi xóa sự kiện";
        }

        Utils.showToast?.(errorMessage, "error");
      }
    },
    // ==========================================================
    // UPDATE EVENT STATUS - SIMPLIFIED
    // ==========================================================
    async _updateEventStatus(event) {
      try {
        const completed = document.getElementById(
          "eventCompletedCheckbox"
        ).checked;

        // ⚠️ FIX: Sử dụng field names đúng
        const updateData = {
          completed: completed, // Backend calendar.js kiểm tra d.completed !== undefined
        };

        const res = await Utils.makeRequest(
          `/api/calendar/events/${event.id}`,
          "PUT",
          updateData
        );

        if (res.success) {
          event.setExtendedProp("completed", completed);

          // Update visual
          const eventEls = document.querySelectorAll(
            `[data-event-id="${event.id}"]`
          );
          eventEls.forEach((el) => {
            if (completed) {
              el.classList.add("event-completed");
              el.style.opacity = "0.7";
            } else {
              el.classList.remove("event-completed");
              el.style.opacity = "1";
            }
          });

          Utils.showToast?.(
            completed ? "Đã hoàn thành công việc!" : "Bỏ đánh dấu hoàn thành",
            "success"
          );
          document.getElementById("eventDetailModal").remove();

          // Nếu công việc đã hoàn thành và có taskId, xóa khỏi lịch sau 1s
          if (completed && event.extendedProps.taskId) {
            setTimeout(() => {
              event.remove();
              Utils.showToast?.(
                "Đã xóa công việc đã hoàn thành khỏi lịch",
                "info"
              );
            }, 1000);
          }
        }
      } catch (err) {
        console.error("Cập nhật trạng thái lỗi:", err);
        Utils.showToast?.("Lỗi cập nhật trạng thái", "error");
      }
    },

    // ==========================================================
    // EXTERNAL DRAGGABLE (FullCalendar method)
    // ==========================================================
    setupExternalDraggable() {
      console.log("🔍 Searching for draggable items...");

      // CHỈ TÌM KIẾM TRONG SIDEBAR, KHÔNG PHẢI TOÀN BỘ TRANG
      const selectors = [
        '#task-list div[draggable="true"]',
        "#task-list > div",
        "#task-list [data-task-id]",
      ];

      let draggableItems = [];

      selectors.forEach((selector) => {
        const items = document.querySelectorAll(selector);
        console.log(
          `📦 Found ${items.length} items with selector: ${selector}`
        );
        items.forEach((item) => draggableItems.push(item));
      });

      console.log(`🎯 Total draggable items found: ${draggableItems.length}`);

      if (draggableItems.length === 0) {
        console.log("⚠️ No draggable items found!");
        return;
      }

      // CHỈ SETUP DRAG CHO ITEMS TRONG SIDEBAR
      this.setupDragForItems(draggableItems);
    },

    // ==========================================================
    // NAVBAR BUTTONS
    // ==========================================================
    initializeNavbarEvents() {
      const controls = {
        "cal-prev-btn": () => this.calendar.prev(),
        "cal-next-btn": () => this.calendar.next(),
        "cal-today-btn": () => this.calendar.today(),
        "cal-day-view": () => this.changeView("timeGridDay"),
        "cal-week-view": () => this.changeView("timeGridWeek"),
        "cal-month-view": () => this.changeView("dayGridMonth"),
      };

      Object.entries(controls).forEach(([id, handler]) => {
        const btn = document.getElementById(id);
        if (btn) {
          // Remove old listeners by cloning
          const newBtn = btn.cloneNode(true);
          btn.parentNode.replaceChild(newBtn, btn);
          newBtn.addEventListener("click", (e) => {
            e.preventDefault();
            handler();
            this.updateCalendarTitle();
          });
        }
      });

      this.setActiveView(this.currentView);
    },

    changeView(view) {
      this.currentView = view;
      this.calendar.changeView(view);
      this.updateCalendarTitle();
      this.setActiveView(view);
    },

    setActiveView(view) {
      ["cal-day-view", "cal-week-view", "cal-month-view"].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (
          (view === "timeGridDay" && id === "cal-day-view") ||
          (view === "timeGridWeek" && id === "cal-week-view") ||
          (view === "dayGridMonth" && id === "cal-month-view")
        ) {
          btn.classList.add("bg-white", "text-gray-900", "shadow-sm");
          btn.classList.remove("hover:bg-white");
        } else {
          btn.classList.remove("bg-white", "text-gray-900", "shadow-sm");
          btn.classList.add("hover:bg-white");
        }
      });
    },

    updateCalendarTitle() {
      const titleEl = document.getElementById("calendar-title");
      if (titleEl && this.calendar)
        titleEl.textContent = this.calendar.view.title;
    },

    setupDragForItems(items) {
      if (!items || items.length === 0) return;

      items.forEach((item) => {
        // Xóa listener cũ nếu có
        item.removeEventListener("dragstart", this.handleDragStart);

        item.addEventListener("dragstart", this.handleDragStart.bind(this));
        item.setAttribute("draggable", "true");

        // Thêm data để biết task ID
        const taskId = item.dataset.taskId || item.getAttribute("data-task-id");
        if (taskId) {
          item.dataset.taskId = taskId;
        }
      });

      console.log(`Setup drag cho ${items.length} task items`);
    },

    handleDragStart(e) {
      const taskId = e.target.dataset.taskId;
      const title =
        e.target.querySelector(".task-title")?.textContent || "Công việc";

      if (taskId) {
        e.dataTransfer.setData("text/plain", taskId);
        e.dataTransfer.setData("taskId", taskId);
        e.dataTransfer.setData("title", title);
        console.log("Dragging task:", taskId, title);
      }
    },

    // ==========================================================
    // DESTROY & REFRESH
    // ==========================================================
    destroy() {
      if (this.draggableInstance) {
        try {
          this.draggableInstance.destroy();
        } catch (e) {}
        this.draggableInstance = null;
      }
      if (this.calendar) {
        try {
          this.calendar.destroy();
        } catch (e) {}
        this.calendar = null;
      }
      this.isInitialized = false;
      console.log("CalendarModule đã được destroy");
    },

    refresh() {
      console.log("Refresh calendar...");
      this.init();
    },

    getCalendar() {
      return this.calendar;
    },
  };

  // Export
  window.CalendarModule = CalendarModule;
  console.log("CalendarModule v6.5 FIXED đã sẵn sàng!");
})();
