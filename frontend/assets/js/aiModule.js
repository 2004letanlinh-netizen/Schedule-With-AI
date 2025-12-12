/**
 * AI Module v2.1 - INTEGRATED WITH AI HANDLER
 * Xử lý lịch trình đề xuất bởi AI và hiển thị lên calendar
 */

(function () {
  "use strict";

  // SINGLETON PATTERN - Chỉ một instance duy nhất
  if (window.AIModule && window.AIModule._singleton) {
    console.log("🤖 AIModule singleton already exists, reusing...");
    return window.AIModule;
  }

  const AIModule = {
    _singleton: true,
    calendar: null,
    isInitialized: false,
    initPromise: null,
    currentView: "timeGridWeek",
    suggestedEvents: [],

    // IDs động (có thể config từ bên ngoài để tránh xung đột)
    calendarElementId: "ai-calendar",
    titleElementId: "ai-calendar-title",
    prevBtnId: "ai-cal-prev-btn",
    nextBtnId: "ai-cal-next-btn",
    todayBtnId: "ai-cal-today-btn",
    dayBtnId: "ai-cal-day-view",
    weekBtnId: "ai-cal-week-view",
    monthBtnId: "ai-cal-month-view",

    // ==========================================================
    // PUBLIC: init()
    // ==========================================================
    async init() {
      // Kiểm tra nếu đang ở AI section
      const aiSection = document.getElementById("ai-section");
      const isAISectionActive =
        aiSection &&
        (aiSection.style.display !== "none" ||
          aiSection.classList.contains("active"));

      if (!isAISectionActive) {
        console.log("⏭️ Not in AI section, delaying initialization...");
        // Lưu lại để init khi vào section
        this.shouldInitWhenActivated = true;
        return;
      }

      // Nếu đã init và calendar còn sống -> chỉ refresh
      if (this.isInitialized && this.calendar) {
        console.log("🤖 AIModule already initialized, refreshing UI...");
        await this.refreshFromDatabase();
        this.refreshUI();
        return;
      }

      if (this.initPromise) {
        console.log("🤖 Waiting for existing init promise...");
        return this.initPromise;
      }

      console.log("🤖 Khởi tạo AIModule v2.1...");
      this.initPromise = this._initInternal();

      try {
        await this.initPromise;
        this.isInitialized = true;
        this.shouldInitWhenActivated = false;
        console.log("✅ AIModule khởi tạo thành công!");
      } catch (err) {
        console.error("❌ AI Module initialization failed:", err);
        this.showError(err);
        this.isInitialized = false;
      } finally {
        this.initPromise = null;
      }
    },

    // ==========================================================
    // PRIVATE: _initInternal()
    // ==========================================================
    async _initInternal() {
      const calendarEl = await this.waitForElement(
        this.calendarElementId,
        8000
      );
      if (!calendarEl)
        throw new Error(`Không tìm thấy phần tử #${this.calendarElementId}`);

      await Promise.all([this.waitForFullCalendar(), this.waitForUtils()]);

      // Xóa loading spinner và render calendar
      calendarEl.innerHTML = "";
      calendarEl.style.minHeight = "700px";

      // Tải events thực tế
      const existingEvents = await this.loadEventsForAI();

      // Render calendar với events hiện có
      this.renderCalendar(existingEvents);

      this.setupSectionChangeHandler();
      this.preserveCalendarOnNavigation();
      this.setupVisibilityHandler();

      // KHÔNG gọi refreshFromDatabase ngay - sẽ gọi khi section activated
      // await this.refreshFromDatabase();

      // Setup section change handler
      this.setupSectionChangeHandler();

      // Setup navbar và nút AI
      setTimeout(() => {
        this.initializeNavbarEvents();
        this.setupAIButton();
        this.updateCalendarTitle();
      }, 100);
    },

    // Thêm vào cuối hàm _initInternal
    setupVisibilityHandler() {
      // Refresh khi tab trở nên visible
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          const aiSection = document.getElementById("ai-section");
          if (aiSection && aiSection.style.display !== "none") {
            console.log("👀 Tab visible, refreshing AI calendar...");
            // Debounce refresh
            if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
            this.refreshTimeout = setTimeout(() => {
              this.refreshFromDatabase();
            }, 500);
          }
        }
      });

      // Mutation observer để phát hiện section changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "attributes" &&
            mutation.attributeName === "style" &&
            mutation.target.id === "ai-section"
          ) {
            const isVisible = mutation.target.style.display !== "none";
            if (isVisible && this.shouldInitWhenActivated) {
              console.log("🎯 AI section became visible, initializing...");
              this.init();
            }
          }
        });
      });

      const aiSection = document.getElementById("ai-section");
      if (aiSection) {
        observer.observe(aiSection, { attributes: true });
      }
    },

    // ==========================================================
    // LOAD EVENTS FOR AI CALENDAR - CHỈ LẤY AI SUGGESTIONS
    // ==========================================================
    // THAY THẾ HÀM NÀY
    async loadEventsForAI() {
      try {
        console.log("Đang tải lịch AI từ database...");

        if (!Utils?.makeRequest) {
          console.warn("Utils.makeRequest không tồn tại");
          return [];
        }

        // DÙNG API ĐÚNG
        const res = await Utils.makeRequest("/api/ai/events/ai", "GET");

        if (!res.success || !Array.isArray(res.data)) {
          console.log("Không có lịch AI nào", res);
          return [];
        }

        const events = res.data.map((ev) => {
          // ĐẢM BẢO CÓ MÀU
          const color =
            ev.Color ||
            ev.color ||
            this.getPriorityColor(ev.priority) ||
            "#8B5CF6";

          return {
            id: ev.MaLichTrinh || `ai-${ev.MaCongViec}-${Date.now()}`,
            title: ev.TieuDe || "AI Đề xuất",
            start: ev.GioBatDau,
            end: ev.GioKetThuc,
            backgroundColor: color,
            borderColor: color,
            classNames: ["event-ai-suggested"],
            extendedProps: {
              taskId: ev.MaCongViec,
              reason: ev.GhiChu,
              aiSuggested: true,
              priority: ev.priority,
            },
          };
        });

        console.log(`✅ Đã tải ${events.length} lịch AI`);
        return events;
      } catch (err) {
        console.error("Lỗi load lịch AI:", err);
        return [];
      }
    },

    // THÊM HÀM HELPER MỚI
    getPriorityColor(priority) {
      const colors = {
        1: "#10B981", // Xanh lá
        2: "#3B82F6", // Xanh dương
        3: "#F59E0B", // Vàng cam
        4: "#EF4444", // Đỏ
      };
      return colors[priority] || "#8B5CF6"; // Tím mặc định
    },

    // ==========================================================
    // ⭐ LOAD AI SUGGESTIONS - Hàm chính để hiển thị AI suggestions
    // ==========================================================
    // SỬA HÀM loadAISuggestions
    async loadAISuggestions(suggestions) {
      try {
        console.log("🤖 Loading AI suggestions:", suggestions);

        if (
          !suggestions ||
          !Array.isArray(suggestions) ||
          suggestions.length === 0
        ) {
          Utils.showToast?.("Không có đề xuất từ AI", "warning");
          return [];
        }

        // 1. XÓA AI EVENTS CŨ
        await this.clearOldAISuggestions();

        // 2. KIỂM TRA CALENDAR
        if (!this.calendar) {
          console.error("❌ Calendar chưa được khởi tạo");
          throw new Error("Calendar chưa sẵn sàng");
        }

        // 3. XÓA CÁC AI EVENTS CŨ TRONG CALENDAR
        const existingAIEvents = this.calendar
          .getEvents()
          .filter((event) => event.extendedProps?.aiSuggested === true);

        console.log(
          `🗑️ Removing ${existingAIEvents.length} old AI events from calendar...`
        );
        existingAIEvents.forEach((event) => {
          try {
            event.remove();
          } catch (e) {
            console.warn("Could not remove event:", e);
          }
        });

        // 4. LẤY THÔNG TIN CÔNG VIỆC ĐỂ HIỂN THỊ TÊN
        const taskTitles = {};
        try {
          const res = await Utils.makeRequest("/api/tasks", "GET");
          if (res.success && Array.isArray(res.data)) {
            res.data.forEach((task) => {
              taskTitles[task.MaCongViec || task.ID || task.id] =
                task.TieuDe ||
                task.title ||
                `Công việc #${task.MaCongViec || task.ID}`;
            });
          }
        } catch (err) {
          console.warn("⚠️ Không thể lấy thông tin công việc:", err);
        }

        // 5. THÊM AI EVENTS MỚI VỚI TÊN CÔNG VIỆC
        const aiEvents = suggestions.map((suggestion, index) => {
          const start = new Date(suggestion.scheduledTime);
          const end = new Date(
            start.getTime() + (suggestion.durationMinutes || 60) * 60000
          );

          // LẤY TÊN CÔNG VIỆC
          const taskTitle =
            taskTitles[suggestion.taskId] ||
            suggestion.taskTitle ||
            `Công việc #${suggestion.taskId || index}`;

          return {
            id: `ai-suggestion-${suggestion.taskId || index}-${Date.now()}`,
            title: taskTitle, // SỬ DỤNG TÊN CÔNG VIỆC THAY VÌ ID
            start: start.toISOString(),
            end: end.toISOString(),
            backgroundColor: suggestion.color || "#8B5CF6",
            borderColor: suggestion.color || "#7c3aed",
            classNames: ["event-ai-suggested"],
            extendedProps: {
              taskId: suggestion.taskId,
              taskTitle: taskTitle, // LƯU TÊN CÔNG VIỆC
              reason: suggestion.reason || "AI đề xuất",
              aiSuggested: true,
              durationMinutes: suggestion.durationMinutes || 60,
              priority: suggestion.priority || "medium",
              isAISuggestion: true,
            },
          };
        });

        // 6. THÊM SỰ KIỆN MỚI
        let addedCount = 0;
        aiEvents.forEach((event) => {
          try {
            this.calendar.addEvent(event);
            addedCount++;
          } catch (error) {
            console.error("❌ Error adding event:", event.title, error);
          }
        });

        // 7. RENDER LẠI CALENDAR
        this.calendar.render();

        console.log(
          `✅ Added ${addedCount} new AI suggestions with task titles`
        );
        return aiEvents;
      } catch (err) {
        console.error("❌ Error loading AI suggestions:", err);
        throw err;
      }
    },

    openAiSuggestionModal() {
      console.log("🤖 Opening AI suggestion modal...");

      try {
        const modal = document.getElementById("aiSuggestionModal");

        if (!modal) {
          console.error("❌ AI modal element not found");
          alert("Không tìm thấy modal AI. Vui lòng tải lại trang.");
          return;
        }

        // Hiển thị modal
        modal.classList.add("active", "show");
        modal.style.display = "flex";
        document.body.classList.add("modal-open");

        console.log("✅ Modal displayed");

        // Wait 500ms rồi init AIHandler
        setTimeout(() => {
          console.log("🔄 Initializing AIHandler...");

          if (window.AIHandler && window.AIHandler.initAIModal) {
            AIHandler.initAIModal()
              .then(() => {
                console.log("✅ AIHandler initialized successfully");
              })
              .catch((error) => {
                console.error("❌ AIHandler init failed:", error);
                this.showModalError(error.message);
              });
          } else {
            console.error("❌ AIHandler not available");
            this.showModalError(
              "AIHandler không khả dụng. Vui lòng tải lại trang."
            );
          }
        }, 500);
      } catch (error) {
        console.error("❌ Error opening modal:", error);
        alert("Lỗi mở modal: " + error.message);
      }
    },

    // SỬA FILE: aiModule.js - THÊM HÀM clearOldAISuggestions()
    async clearOldAISuggestions() {
      try {
        console.log("🗑️ Clearing old AI suggestions from database...");

        if (!Utils?.makeRequest) {
          console.warn("Utils.makeRequest không tồn tại");
          return false;
        }

        // Gọi API để xóa tất cả AI events cũ
        const res = await Utils.makeRequest(
          "/api/ai/clear-old-suggestions",
          "DELETE"
        );

        if (res.success) {
          console.log(`✅ Cleared ${res.clearedCount || 0} old AI suggestions`);
          return true;
        } else {
          console.warn("⚠️ Could not clear old AI suggestions:", res.message);
          return false;
        }
      } catch (error) {
        console.error("❌ Error clearing old AI suggestions:", error);
        return false;
      }
    },

    async clearOldAISuggestions() {
      try {
        console.log("🗑️ Clearing old AI suggestions from database...");

        if (!Utils?.makeRequest) {
          console.warn("Utils.makeRequest không tồn tại");
          return false;
        }

        // Gọi API để xóa tất cả AI events cũ
        const res = await Utils.makeRequest(
          "/api/ai/clear-old-suggestions",
          "DELETE"
        );

        if (res.success) {
          console.log(`✅ Cleared ${res.clearedCount || 0} old AI suggestions`);
          return true;
        } else {
          console.warn("⚠️ Could not clear old AI suggestions:", res.message);
          return false;
        }
      } catch (error) {
        console.error("❌ Error clearing old AI suggestions:", error);
        return false;
      }
    },

    /**
     * Hiển thị lỗi trong modal
     */
    showModalError(message) {
      const modalBody = document.querySelector(
        "#aiSuggestionModal .ai-modal-body"
      );
      if (modalBody) {
        modalBody.innerHTML = `
      <div class="error-state" style="text-align: center; padding: 40px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>
        <p style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Không thể tải dữ liệu</p>
        <p style="color: #666; margin-bottom: 20px;">${message}</p>
        <button class="btn btn-primary" onclick="AIModule.openAiSuggestionModal()" style="padding: 10px 20px; background: #3B82F6; color: white; border: none; border-radius: 8px; cursor: pointer;">
          <i class="fas fa-redo"></i>
          Thử lại
        </button>
      </div>
    `;
      }
    },

    /**
     * Helper để đóng modal
     */
    closeModal() {
      const modal = document.getElementById("aiSuggestionModal");
      if (modal) {
        modal.classList.remove("active", "show");
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        console.log("✅ Modal closed");
      }
    },

    /**
     * Initialize AI modal content với AIHandler
     */
    async initAIModalContent() {
      try {
        console.log("🔄 Initializing AI modal content...");

        // Chờ cho modal và AIHandler sẵn sàng
        await this.waitForModalReady();

        // Gọi AIHandler để populate tasks
        if (window.AIHandler && window.AIHandler.populateAIModal) {
          console.log("📋 Calling AIHandler.populateAIModal...");
          await AIHandler.populateAIModal();
        } else {
          console.warn(
            "⚠️ AIHandler not available or missing populateAIModal method"
          );
          this.showModalError("AIHandler không khả dụng");
        }
      } catch (error) {
        console.error("❌ Error initializing AI modal:", error);
        this.showModalError(error.message);
      }
    },

    /**
     * Chờ modal và dependencies sẵn sàng
     */
    async waitForModalReady() {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 20;

        const check = () => {
          attempts++;

          const modal = document.getElementById("aiSuggestionModal");
          const taskList = modal?.querySelector(".task-list");

          if (modal && taskList && window.AIHandler) {
            console.log("✅ Modal and dependencies ready");
            resolve(true);
          } else if (attempts >= maxAttempts) {
            reject(new Error("Modal not ready after maximum attempts"));
          } else {
            console.log(`⏳ Waiting for modal... (${attempts}/${maxAttempts})`);
            setTimeout(check, 100);
          }
        };

        check();
      });
    },

    /**
     * Phương pháp fallback: Tự hiển thị modal
     */
    showAIModalFallback() {
      console.log("🔄 Using fallback method to show AI modal");

      // Tạo modal HTML tạm thời
      const modalHtml = `
        <div class="modal active show" id="aiSuggestionModal" style="display: flex; z-index: 10001;">
          <div class="modal-overlay"></div>
          <div class="modal-content">
            <div class="ai-modal-content">
              <div class="ai-modal-header">
                <div class="modal-header-left">
                  <div class="modal-icon">
                    <i class="fas fa-robot"></i>
                  </div>
                  <div class="modal-title">
                    <h3>🤖 Trợ lý AI Lập Lịch</h3>
                    <p class="modal-subtitle">AI sẽ giúp bạn sắp xếp công việc thông minh</p>
                  </div>
                </div>
                <button class="modal-close" onclick="document.getElementById('aiSuggestionModal').remove()">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              
              <div class="ai-modal-body">
                <div class="loading-state">
                  <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                  </div>
                  <p>Đang tải danh sách công việc...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Remove existing modal
      document.getElementById("aiSuggestionModal")?.remove();

      // Add modal to body
      document.body.insertAdjacentHTML("beforeend", modalHtml);
      document.body.classList.add("modal-open");

      // Gọi AIHandler để load tasks
      setTimeout(() => {
        if (window.AIHandler && window.AIHandler.populateAIModal) {
          AIHandler.populateAIModal();
        }
      }, 300);
    },

    // ==========================================================
    // REFRESH UI
    // ==========================================================
    refreshUI() {
      if (this.calendar) {
        this.calendar.render();
        this.updateCalendarTitle();
        this.initializeNavbarEvents();
        this.setActiveView(this.currentView);
      }
    },

    // ==========================================================
    // UTILS
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

    waitForUtils(timeout = 10000) {
      return new Promise((resolve, reject) => {
        if (typeof Utils !== "undefined") return resolve();

        const start = Date.now();
        const check = () => {
          if (typeof Utils !== "undefined") resolve();
          else if (Date.now() - start > timeout)
            reject(new Error("Utils timeout"));
          else setTimeout(check, 100);
        };
        check();
      });
    },

    showError(error) {
      const el = document.getElementById(this.calendarElementId);
      if (!el) return;

      el.innerHTML = `
        <div class="flex items-center justify-center h-96">
          <div class="text-center p-10 bg-red-50 rounded-xl">
            <div class="text-6xl mb-4">❌</div>
            <h3 class="text-2xl font-bold text-red-700 mb-3">Không tải được lịch AI</h3>
            <p class="text-gray-600 mb-6">${error.message || error}</p>
            <button onclick="location.reload()" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Tải lại trang
            </button>
          </div>
        </div>
      `;
    },

    // ==========================================================
    // RENDER CALENDAR
    // ==========================================================
    renderCalendar(events) {
      const containerEl = document.getElementById(this.calendarElementId);

      if (!containerEl) {
        console.error("❌ AI calendar container not found");
        return;
      }

      // Nếu calendar đã tồn tại, chỉ update events
      if (this.calendar) {
        console.log("🔄 Updating existing AI calendar with new events");

        // Xóa events cũ
        const existingEvents = this.calendar.getEvents();
        existingEvents.forEach((event) => {
          try {
            event.remove();
          } catch (e) {
            // Ignore
          }
        });

        // Thêm events mới
        events.forEach((event) => {
          try {
            this.calendar.addEvent(event);
          } catch (error) {
            console.error("Error adding event:", error);
          }
        });

        // Refresh view
        this.calendar.render();
        return;
      }

      // Tạo calendar mới
      console.log("🆕 Creating new AI calendar");

      this.calendar = new FullCalendar.Calendar(containerEl, {
        // ... giữ nguyên các options ...
        headerToolbar: false,
        initialView: this.currentView,
        height: "100%",
        editable: false,
        selectable: false,
        events: events,
        // ... các options khác ...
      });

      this.calendar.render();
      console.log("✅ AI Calendar rendered");
    },

    // ==========================================================
    // PRESERVE CALENDAR ON NAVIGATION
    // ==========================================================
    preserveCalendarOnNavigation() {
      console.log("🔐 Setting up calendar preservation...");

      // Lưu trạng thái calendar trước khi chuyển section
      const originalNavigation = window.AppNavigation?.navigateToSection;

      if (originalNavigation) {
        // Wrap navigation function
        window.AppNavigation.navigateToSection = function (sectionId) {
          console.log(
            `🧭 Navigating to ${sectionId}, preserving AI calendar...`
          );

          // Nếu đang ở AI section và chuyển đi, lưu trạng thái
          const currentSection = this.currentSection;
          if (currentSection === "ai-section" && sectionId !== "ai-section") {
            if (window.AIModule?.calendar) {
              window.AIModule.lastView = window.AIModule.currentView;
              window.AIModule.lastDate = window.AIModule.calendar?.getDate();
              console.log("💾 Saved AI calendar state:", {
                view: window.AIModule.lastView,
                date: window.AIModule.lastDate,
              });
            }
          }

          // Gọi hàm gốc
          return originalNavigation.call(this, sectionId);
        };

        console.log("✅ Calendar preservation setup complete");
      }
    },

    // ==========================================================
    // EVENT HANDLING
    // ==========================================================
    handleEventClick(info) {
      const props = info.event.extendedProps;
      console.log("Event clicked:", info.event.title, props);

      // Hiển thị thông tin sự kiện
      const isAI = props.aiSuggested;
      const modalTitle = isAI ? "🤖 Sự kiện do AI đề xuất" : "📅 Sự kiện";

      const startTime = new Date(info.event.start).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const endTime = new Date(info.event.end).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (window.Utils && Utils.showToast) {
        Utils.showToast(
          `${modalTitle}\n${info.event.title}\n${startTime} - ${endTime}\n${
            props.reason || props.note || ""
          }`,
          "info"
        );
      }
    },

    // ==========================================================
    // AI BUTTON SETUP
    // ==========================================================
    setupAIButton() {
      const btn = document.getElementById("ai-suggest-btn");
      if (btn) {
        // Remove old listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener("click", () => this.openAiSuggestionModal());
      }
    },

    // ==========================================================
    // VIEW MANAGEMENT
    // ==========================================================
    changeView(view) {
      this.currentView = view;
      if (this.calendar) {
        this.calendar.changeView(view);
        this.updateCalendarTitle();
        this.setActiveView(view);
      }
    },

    setActiveView(view) {
      [this.dayBtnId, this.weekBtnId, this.monthBtnId].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const isActive =
          (view === "timeGridDay" && id === this.dayBtnId) ||
          (view === "timeGridWeek" && id === this.weekBtnId) ||
          (view === "dayGridMonth" && id === this.monthBtnId);

        if (isActive) {
          btn.classList.add("bg-white", "text-gray-900", "shadow-sm");
          btn.classList.remove("text-gray-700", "hover:bg-white");
        } else {
          btn.classList.remove("bg-white", "text-gray-900", "shadow-sm");
          btn.classList.add("text-gray-700", "hover:bg-white");
        }
      });
    },

    updateCalendarTitle() {
      const titleEl = document.getElementById(this.titleElementId);
      if (titleEl && this.calendar) {
        titleEl.textContent = this.calendar.view.title;
      }
    },

    // ==========================================================
    // NAVBAR BUTTONS
    // ==========================================================
    initializeNavbarEvents() {
      const controls = {
        [this.prevBtnId]: () => {
          this.calendar.prev();
          this.updateCalendarTitle();
        },
        [this.nextBtnId]: () => {
          this.calendar.next();
          this.updateCalendarTitle();
        },
        [this.todayBtnId]: () => {
          this.calendar.today();
          this.updateCalendarTitle();
        },
        [this.dayBtnId]: () => this.changeView("timeGridDay"),
        [this.weekBtnId]: () => this.changeView("timeGridWeek"),
        [this.monthBtnId]: () => this.changeView("dayGridMonth"),
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
          });
        }
      });

      this.setActiveView(this.currentView);
    },

    // ==========================================================
    // DESTROY & CLEANUP
    // ==========================================================
    destroy() {
      // CHỈ destroy nếu đây là calendar thường, không phải AI calendar
      const isAICalendar =
        this.calendarElementId && this.calendarElementId.includes("ai");

      if (!isAICalendar) {
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
      } else {
        console.log("⚠️ Không destroy AI calendar khi chuyển section");
      }
    },

    refresh() {
      if (this.calendar && this.isInitialized) {
        console.log("🤖 Refreshing AI calendar...");
        this.refreshUI();
      } else {
        console.log("🤖 AIModule not initialized, calling init()...");
        this.init();
      }
    },

    // THAY THẾ hàm refreshFromDatabase trong aiModule.js

    async refreshFromDatabase() {
      try {
        console.log("🔄 Refreshing AI calendar from database...");

        if (!this.calendar) {
          console.log("Calendar not ready, calling init()...");
          await this.init();
          return 0;
        }

        // 1. Lấy events từ API AI (chỉ lịch AI)
        const aiEvents = await this.loadEventsForAI();

        console.log(`📊 AI events loaded: ${aiEvents.length}`);

        // 2. Xóa chỉ các events AI cũ
        const existingEvents = this.calendar.getEvents();
        const aiEventsToRemove = existingEvents.filter(
          (event) => event.extendedProps?.aiSuggested === true
        );

        console.log(`🗑️ Removing ${aiEventsToRemove.length} old AI events...`);
        aiEventsToRemove.forEach((event) => {
          try {
            event.remove();
          } catch (e) {
            console.warn(`⚠️ Failed to remove event ${event.id}:`, {
              error: error.message,
              title: event.title,
              // Có thể thêm recovery logic ở đây
            });

            // Optional: Try alternative removal
            try {
              // Nếu calendar có phương thức getEventById
              const eventById = this.calendar.getEventById(event.id);
              if (eventById) {
                eventById.remove();
                console.log(`✅ Removed via fallback: ${event.id}`);
              }
            } catch (fallbackError) {
              console.error(
                `❌ Fallback also failed for ${event.id}:`,
                fallbackError
              );
            }
          }
        });

        // 3. Thêm events AI mới
        let addedCount = 0;
        aiEvents.forEach((event) => {
          try {
            this.calendar.addEvent(event);
            addedCount++;
          } catch (error) {
            console.error("Error adding AI event:", error);
          }
        });

        // 4. Cập nhật danh sách và render
        this.suggestedEvents = aiEvents;

        if (aiEvents.length > 0) {
          this.calendar.render();
          console.log(`✅ Added ${addedCount} AI events to calendar`);
        } else {
          console.log("📭 Không có AI events để hiển thị");
        }

        // 5. Cập nhật title
        this.updateCalendarTitle();

        return addedCount;
      } catch (error) {
        console.error("❌ Error refreshing from database:", error);
        return 0;
      }
    },

    // ==========================================================
    // CHECK AND RESTORE CALENDAR
    // ==========================================================
    async checkAndRestoreCalendar() {
      console.log("🔍 Checking AI calendar state...");

      const calendarEl = document.getElementById(this.calendarElementId);
      if (!calendarEl) {
        console.error("❌ AI calendar element not found");
        return false;
      }

      // Kiểm tra nếu calendar bị mất
      if (!this.calendar) {
        console.log("🔄 AI calendar bị mất, restoring...");

        // Lấy events hiện có
        const events = await this.loadEventsForAI();

        // Tạo lại calendar
        this.renderCalendar(events);

        // Khôi phục view nếu có
        if (this.lastView) {
          setTimeout(() => {
            this.changeView(this.lastView);
          }, 100);
        }

        // Khôi phục date nếu có
        if (this.lastDate && this.calendar) {
          setTimeout(() => {
            this.calendar.gotoDate(this.lastDate);
          }, 150);
        }

        console.log("✅ AI calendar restored");
        return true;
      }

      console.log("✅ AI calendar is intact");
      return true;
    },
    // ==========================================================
    // SECTION/TAB CHANGE HANDLER
    // ==========================================================
    setupSectionChangeHandler() {
      console.log("🔧 Setting up section change handler for AI...");

      // Lắng nghe sự kiện chuyển section
      document.addEventListener("section-changed", (e) => {
        const sectionId = e.detail?.sectionId;
        const isAISection = sectionId === "ai-section" || sectionId === "ai";

        if (isAISection) {
          console.log("🎯 AI section activated, checking calendar...");
          this.handleAISectionActivated();
        } else {
          console.log(`📌 Switching to ${sectionId}, preserving AI calendar`);
          this.handleOtherSectionActivated();
        }
      });

      // Lắng nghe tab changes
      document.addEventListener("tab-shown", (e) => {
        if (
          e.detail?.tabId === "ai-calendar-tab" ||
          e.detail?.tabId === "ai-tab"
        ) {
          console.log("🔔 AI tab shown, refreshing...");
          setTimeout(() => {
            this.refreshFromDatabase();
          }, 300);
        }
      });
    },

    handleAISectionActivated() {
      console.log("🤖 AI section activated");

      // Đảm bảo calendar tồn tại
      if (!this.calendar) {
        console.log("📅 AI calendar chưa được init, initializing...");
        setTimeout(() => {
          this.init();
        }, 100);
      } else {
        // Nếu calendar đã tồn tại, chỉ cần refresh
        console.log("🔄 Refreshing existing AI calendar...");
        setTimeout(() => {
          this.refreshFromDatabase();
          this.refreshUI();
        }, 200);
      }
    },

    handleOtherSectionActivated() {
      console.log("📌 Other section activated, preserving AI calendar");

      // KHÔNG destroy calendar, chỉ ẩn nếu cần
      if (this.calendar) {
        // Giữ calendar trong memory nhưng có thể ẩn visual
        const calendarEl = document.getElementById(this.calendarElementId);
        if (calendarEl) {
          // Chỉ ẩn thay vì destroy
          calendarEl.style.opacity = "0.95";
          calendarEl.style.pointerEvents = "none";
        }
      }
    },

    // THÊM HÀM MỚI: Tải AI suggestions từ database
    async loadAISuggestionsFromDB() {
      try {
        console.log("🤖 Loading AI suggestions from database...");

        if (!Utils?.makeRequest) {
          console.warn("Utils.makeRequest không tồn tại");
          return [];
        }

        // API endpoint mới để lấy AI suggestions
        const res = await Utils.makeRequest("/api/calendar/ai-events", "GET");

        if (!res.success || !Array.isArray(res.data)) return [];

        const aiEvents = res.data.map((ev) => ({
          id: ev.MaLichTrinh || ev.ID || `ai-${ev.taskId}-${Date.now()}`,
          title: ev.TieuDe || ev.title || `Công việc #${ev.taskId}`,
          start: ev.GioBatDau || ev.start,
          end: ev.GioKetThuc || ev.end,
          backgroundColor: ev.Color || ev.color || "#8B5CF6",
          borderColor: ev.Color || ev.color || "#7c3aed",
          classNames: ["event-ai-suggested"],
          extendedProps: {
            note: ev.GhiChu || ev.reason || "AI đề xuất",
            completed: ev.DaHoanThanh === 1,
            taskId: ev.MaCongViec || ev.taskId,
            aiSuggested: true, // Đánh dấu đây là AI suggestion
            reason: ev.reason || "",
            durationMinutes: ev.durationMinutes || 60,
            priority: ev.priority || "medium",
            // ⭐ GIỮ LẠI MÀU TỪ DATABASE
            originalColor: ev.Color || ev.color,
          },
        }));

        console.log(`✅ Loaded ${aiEvents.length} AI events from database`);
        return aiEvents;
      } catch (err) {
        console.error("❌ Load AI suggestions error:", err);
        return [];
      }
    },

    async loadAIEventsFromDatabase() {
      try {
        console.log("🤖 Loading AI events from database (AI_DeXuat = 1)...");

        if (!Utils?.makeRequest) {
          console.warn("Utils.makeRequest không tồn tại");
          return [];
        }

        // Gọi API endpoint mới hoặc sửa query
        const res = await Utils.makeRequest("/api/calendar/events", "GET");

        if (!res.success || !Array.isArray(res.data)) return [];

        // Lọc các event có AI_DeXuat = true hoặc được AI đề xuất
        const aiEvents = res.data.filter(
          (ev) =>
            ev.extendedProps?.aiSuggested === true ||
            ev.AI_DeXuat === true ||
            ev.isAISuggestion === true
        );

        console.log(`✅ Found ${aiEvents.length} AI events in database`);

        // Chuyển đổi sang định dạng calendar
        const calendarEvents = aiEvents.map((ev) => {
          return {
            id: ev.MaLichTrinh || ev.ID || `ai-${Date.now()}-${Math.random()}`,
            title: ev.TieuDe || ev.title || "AI Đề xuất",
            start: ev.ThoiGianBatDau || ev.start,
            end: ev.ThoiGianKetThuc || ev.end,
            backgroundColor: ev.MaMau || ev.Color || "#8B5CF6",
            borderColor: ev.MaMau || ev.Color || "#7c3aed",
            classNames: ["event-ai-suggested"],
            extendedProps: {
              note: ev.GhiChu || ev.reason || "AI đề xuất",
              completed: ev.DaHoanThanh === 1,
              taskId: ev.MaCongViec || ev.taskId,
              aiSuggested: true,
              reason: ev.reason || "",
              durationMinutes: ev.durationMinutes || 60,
              priority: ev.priority || "medium",
              originalColor: ev.MaMau || ev.Color,
            },
          };
        });

        return calendarEvents;
      } catch (err) {
        console.error("❌ Error loading AI events from database:", err);
        return [];
      }
    },

    async testAIEventCreation() {
      try {
        console.log("🧪 Testing AI event creation...");

        const testPayload = {
          MaCongViec: 5015, // Thay bằng taskId thực tế
          GioBatDau: new Date().toISOString(),
          GioKetThuc: new Date(Date.now() + 60 * 60000).toISOString(),
          GhiChu: "Test AI event",
          AI_DeXuat: true,
        };

        console.log("Test payload:", testPayload);

        const response = await Utils.makeRequest(
          "/api/calendar/events",
          "POST",
          testPayload
        );
        console.log("Test response:", response);

        return response;
      } catch (error) {
        console.error("❌ Test failed:", error);
        return { success: false, error: error.message };
      }
    },

    // THÊM: Hàm để lưu AI suggestions vào database (đã có trong AIHandler)
    async saveAISuggestions(suggestions) {
      try {
        console.log(`💾 Saving ${suggestions.length} AI suggestions...`);

        // Gọi AIHandler để lưu vào database
        if (window.AIHandler && window.AIHandler.saveAISuggestionsToDatabase) {
          const result = await AIHandler.saveAISuggestionsToDatabase(
            suggestions
          );
          console.log("✅ AI suggestions saved:", result);
          return result;
        }

        console.warn("⚠️ AIHandler not available for saving suggestions");
        return { success: false, message: "AIHandler not available" };
      } catch (error) {
        console.error("❌ Error saving AI suggestions:", error);
        throw error;
      }
    },

    getCalendar() {
      return this.calendar;
    },

    restoreCalendar() {
      if (!this.calendar) return;

      console.log("🤖 Restoring AI calendar...");

      const aiCalendar = document.getElementById(this.calendarElementId);
      if (aiCalendar) {
        // Hiển thị lại calendar
        aiCalendar.style.opacity = "1";
        aiCalendar.style.pointerEvents = "auto";
        aiCalendar.style.position = "relative";
        aiCalendar.style.left = "0";

        // Khôi phục view nếu có
        if (this.lastView && this.calendar.view.type !== this.lastView) {
          this.changeView(this.lastView);
        }

        // Khôi phục ngày nếu có
        if (this.lastDate) {
          this.calendar.gotoDate(this.lastDate);
        }

        // Refresh nếu cần
        this.refreshUI();
      }
    },
  };

  // Export singleton
  window.AIModule = AIModule;
  console.log("🤖 AIModule v2.1 (Integrated with AIHandler) đã sẵn sàng!");
})();
