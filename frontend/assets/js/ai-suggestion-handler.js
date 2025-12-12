// js/ai-suggestion-handler.js - FIXED VERSION v9.2 - FE/BE SEPARATION
(() => {
  "use strict";

  // Nếu đã có rồi thì không tạo lại
  if (window.AIHandler) {
    console.log("AIHandler đã tồn tại → bỏ qua load lại");
    return;
  }

  const AIHandler = {
    API_ENDPOINTS: {
      suggestSchedule: "/api/ai/suggest-schedule",
      getTasks: "/api/tasks",
      getCalendarEvents: "/api/calendar/events",
    },

    /**
     * ======================================================
     * 1. MAIN INITIALIZATION - ĐẦY ĐỦ
     * ======================================================
     */

    async initAIModal() {
      try {
        console.log("🚀 Initializing AI modal...");

        await this.waitForModalReady();
        await this.populateAIModal();
        this.setupAllEventListeners();
        this.setDefaultDates();

        console.log("✅ AI modal initialized successfully");
      } catch (error) {
        console.error("❌ Error initializing AI modal:", error);
        this.showErrorInModal(error.message);
      }
    },

    async waitForModalReady() {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50;

        const check = () => {
          attempts++;

          const modal = document.getElementById("aiSuggestionModal");
          const modalBody = modal?.querySelector(".ai-modal-body");

          if (modal && modalBody) {
            console.log("✅ Modal is ready");
            resolve(true);
          } else if (attempts >= maxAttempts) {
            console.error("❌ Modal check failed:", {
              modal: !!modal,
              modalBody: !!modalBody,
            });
            reject(new Error("Modal not ready after maximum attempts"));
          } else {
            if (attempts % 10 === 0) {
              console.log(
                `⏳ Waiting for modal... (${attempts}/${maxAttempts})`
              );
            }
            setTimeout(check, 100);
          }
        };
        check();
      });
    },

    async loadPendingTasks() {
      try {
        console.log("📋 Loading pending tasks for AI modal...");

        if (!Utils?.makeRequest) {
          console.warn("Utils.makeRequest không tồn tại");
          return [];
        }

        const res = await Utils.makeRequest("/api/tasks", "GET");

        if (!res.success || !Array.isArray(res.data)) {
          return [];
        }

        // Lọc các task chưa hoàn thành
        const pendingTasks = res.data.filter(
          (task) =>
            task.TrangThaiThucHien === 0 || task.TrangThaiThucHien === false
        );

        console.log(`📊 Found ${pendingTasks.length} pending tasks`);

        // Map data sang định dạng cho AI
        const tasks = pendingTasks.map((task) => {
          const priority = task.MucDoUuTien || task.priority || 2;

          // Tạo màu dựa trên priority
          const getColorByPriority = (priority) => {
            switch (parseInt(priority)) {
              case 1:
                return "#10B981"; // Xanh lá
              case 2:
                return "#3B82F6"; // Xanh dương
              case 3:
                return "#F59E0B"; // Vàng cam
              case 4:
                return "#EF4444"; // Đỏ
              default:
                return "#8B5CF6"; // Tím
            }
          };

          const timeMap = {
            1: "morning",
            2: "noon",
            3: "afternoon",
            4: "evening",
            5: "anytime",
          };

          return {
            id: task.MaCongViec || task.ID || `task-${Date.now()}`,
            title: task.TieuDe || task.title || "Không tiêu đề",
            estimatedMinutes:
              task.ThoiGianUocTinh || task.estimatedMinutes || 60,
            priority: priority,
            complexity: task.MucDoPhucTap || task.complexity || 2,
            focusLevel: task.MucDoTapTrung || task.focusLevel || 2,
            suitableTime: timeMap[task.ThoiDiemThichHop] || "anytime",
            color: getColorByPriority(priority),
          };
        });

        return tasks;
      } catch (error) {
        console.error("❌ Error loading pending tasks:", error);
        return [];
      }
    },

    async populateAIModal() {
      try {
        console.log("📥 Populating AI modal with tasks...");

        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          console.error("❌ AI modal not found");
          this.showErrorInModal("Không tìm thấy modal");
          return;
        }

        const modalBody = modal.querySelector(".ai-modal-body");
        if (!modalBody) {
          console.error("❌ Modal body not found");
          this.showErrorInModal("Không tìm thấy nội dung modal");
          return;
        }

        // KIỂM TRA NẾU ĐANG Ở PREVIEW MODE
        if (modalBody.querySelector("#aiApplyBtn")) {
          console.log("⚠️ Đang ở preview mode, không populate tasks");
          return;
        }

        // ĐẢM BẢO CÓ FORM
        if (!modalBody.querySelector("#aiSuggestionForm")) {
          console.log("⚠️ Không có form, resetting...");
          await this.resetToFormView();
          return;
        }

        // LOAD TASKS
        const tasks = await this.loadPendingTasks();
        console.log(`📋 Loaded ${tasks.length} tasks`);

        // RENDER TASKS
        const taskList = modal.querySelector("#aiTaskList");
        if (taskList) {
          this.renderTasksToModal(tasks, taskList);
          console.log("✅ Tasks rendered to modal");
        } else {
          console.error("❌ Task list element not found");
          // TẠO LẠI TASK LIST NẾU KHÔNG CÓ
          const taskListContainer = modal.querySelector(".task-list-container");
          if (taskListContainer) {
            const newTaskList = document.createElement("div");
            newTaskList.className = "task-list";
            newTaskList.id = "aiTaskList";
            taskListContainer.insertBefore(
              newTaskList,
              taskListContainer.querySelector(".task-stats")
            );
            this.renderTasksToModal(tasks, newTaskList);
          }
        }

        console.log("✅ Modal populated with tasks");
      } catch (error) {
        console.error("❌ Error populating modal:", error);
        this.showErrorInModal(error.message);
      }
    },

    // THAY THẾ TOÀN BỘ HÀM NÀY
    renderTasksToModal(tasks, taskList) {
      console.log("🔄 Rendering tasks to modal...", {
        tasksCount: tasks?.length,
        taskListExists: !!taskList,
      });

      if (!taskList) {
        console.error("❌ Task list element không hợp lệ");
        return;
      }

      if (!tasks || tasks.length === 0) {
        taskList.innerHTML = this.getEmptyStateHTML();
        this.updateTaskStats(0);
        return;
      }

      let html = "";
      tasks.forEach((task) => {
        const priorityClass = `priority-${task.priority}`;
        const duration = task.estimatedMinutes || 60;

        html += `
      <div class="task-item selectable" data-task-id="${
        task.id
      }" data-selected="false">
        <label class="task-checkbox-label">
          <input type="checkbox" 
                 class="task-checkbox" 
                 value="${task.id}"
                 data-task-id="${task.id}"
                 style="display: none;">
          <span class="checkmark"></span>
        </label>
        <div class="task-content">
          <div class="task-title">${this.escapeHtml(task.title)}</div>
          <div class="task-details">
            <span class="task-priority ${priorityClass}">
              Ưu tiên ${task.priority}
            </span>
            <span class="task-duration">
              <i class="far fa-clock"></i>
              ${duration} phút
            </span>
          </div>
        </div>
        <div class="task-color" style="background-color: ${task.color}"></div>
      </div>
    `;
      });

      taskList.innerHTML = html;
      this.updateTaskStats(tasks.length);

      // THÊM SỰ KIỆN CLICK
      this.setupTaskItemClickEvents();

      console.log(`✅ Đã render ${tasks.length} tasks vào modal`);
    },
    // THÊM HÀM HELPER MỚI
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },

    // Thêm hàm helper để chuyển đổi suitableTime thành label dễ đọc
    getSuitableTimeLabel(timeCode) {
      const timeMap = {
        morning: "Buổi sáng",
        noon: "Buổi trưa",
        afternoon: "Buổi chiều",
        evening: "Buổi tối",
        anytime: "Bất kỳ lúc nào",
      };
      return timeMap[timeCode] || timeCode;
    },

    // Sửa hàm toggleTaskSelection
    toggleTaskSelection(taskItem) {
      const isCurrentlySelected = taskItem.dataset.selected === "true";
      const newSelectedState = !isCurrentlySelected;

      // Cập nhật data attribute
      taskItem.dataset.selected = newSelectedState.toString();

      // Thêm/xóa class selected
      if (newSelectedState) {
        taskItem.classList.add("selected");
      } else {
        taskItem.classList.remove("selected");
      }

      // Cập nhật số lượng đã chọn
      this.updateSelectedCount();
    },

    // Sửa hàm updateSelectedCount để hoạt động với cách mới
    updateSelectedCount() {
      const selectedItems = document.querySelectorAll(
        "#aiSuggestionModal .task-item[data-selected='true']"
      );
      const selectedCount = selectedItems.length;
      const totalCount = document.querySelectorAll(
        "#aiSuggestionModal .task-item"
      ).length;

      console.log(`📊 Selected: ${selectedCount}/${totalCount} tasks`);

      const statsElement = document.querySelector(
        "#aiSuggestionModal #aiTaskStats"
      );
      if (statsElement) {
        statsElement.innerHTML = `Đã chọn: <strong>${selectedCount}</strong> / <strong>${totalCount}</strong> công việc`;
      }
    },

    // Sửa hàm getFormData để lấy selected tasks từ data attribute
    getFormData() {
      try {
        console.log("🔍 Getting form data...");

        const selectedItems = document.querySelectorAll(
          "#aiSuggestionModal .task-item[data-selected='true']"
        );

        const selectedTasks = [];
        selectedItems.forEach((item, index) => {
          const taskId = item.dataset.taskId;
          if (taskId) {
            const parsedId = parseInt(taskId);
            if (!isNaN(parsedId) && parsedId > 0) {
              selectedTasks.push(parsedId);
              console.log(`✅ Task ${index + 1}: ID = ${parsedId}`);
            }
          }
        });

        console.log(`📋 Total selected tasks: ${selectedTasks.length}`);
        console.log(`📋 Task IDs:`, selectedTasks);

        if (selectedTasks.length === 0) {
          this.showError("Vui lòng chọn ít nhất một công việc!");
          return null;
        }

        // ... phần còn lại giữ nguyên ...
        const startDate = document.getElementById("aiStartDate")?.value;
        const endDate = document.getElementById("aiEndDate")?.value;

        if (!startDate || !endDate) {
          this.showError("Vui lòng chọn khoảng thời gian!");
          return null;
        }

        const options = {
          avoidConflict:
            document.getElementById("aiOptionAvoidConflict")?.checked !== false,
          considerPriority:
            document.getElementById("aiOptionConsiderPriority")?.checked !==
            false,
          balanceWorkload:
            document.getElementById("aiOptionBalanceWorkload")?.checked !==
            false,
        };

        const formData = {
          tasks: selectedTasks,
          startDate,
          endDate,
          options,
        };

        console.log("✅ Form data ready:", formData);
        return formData;
      } catch (error) {
        console.error("❌ Error getting form data:", error);
        this.showError("Lỗi lấy dữ liệu form: " + error.message);
        return null;
      }
    },

    setupTaskItemClickEvents() {
      const taskItems = document.querySelectorAll(
        "#aiSuggestionModal .task-item.selectable"
      );

      taskItems.forEach((item) => {
        // Xóa listener cũ để tránh trùng lặp
        item.removeEventListener("click", this.handleTaskItemClick);

        // Thêm listener mới
        item.addEventListener("click", (e) => {
          // Không xử lý nếu click vào checkbox
          if (e.target.type === "checkbox") return;

          this.toggleTaskSelection(item);
        });
      });
    },

    toggleTaskSelection(taskItem) {
      console.log("🖱️ Toggling task selection:", taskItem.dataset.taskId);

      if (!taskItem) {
        console.error("❌ Task item is null");
        return;
      }

      const checkbox = taskItem.querySelector(".task-checkbox");
      console.log("🔍 Found checkbox:", checkbox);

      if (!checkbox) {
        console.error("❌ Checkbox not found in task item");
        return;
      }

      // Toggle trạng thái
      const isCurrentlySelected = taskItem.dataset.selected === "true";
      const newSelectedState = !isCurrentlySelected;

      console.log(
        `🔄 Toggling from ${isCurrentlySelected} to ${newSelectedState}`
      );

      // Cập nhật checkbox
      checkbox.checked = newSelectedState;

      // Cập nhật data attribute
      taskItem.dataset.selected = newSelectedState.toString();

      // Cập nhật UI
      const selectionIndicator = taskItem.querySelector(".selection-checkbox");
      if (selectionIndicator) {
        if (newSelectedState) {
          taskItem.classList.add("selected");
          selectionIndicator.innerHTML =
            '<i class="fas fa-check-circle" style="color: #10B981;"></i>';
        } else {
          taskItem.classList.remove("selected");
          selectionIndicator.innerHTML =
            '<i class="fas fa-check-circle" style="color: #ccc;"></i>';
        }
      }

      // Cập nhật số lượng đã chọn
      this.updateSelectedCount();

      console.log(`✅ Task ${taskItem.dataset.taskId} selection updated`);
    },

    updateSelectedCount() {
      const selectedItems = document.querySelectorAll(
        '#aiSuggestionModal .task-item[data-selected="true"]'
      );
      const selectedCount = selectedItems.length;
      const totalCount = document.querySelectorAll(
        "#aiSuggestionModal .task-item"
      ).length;

      console.log(`📊 Selected: ${selectedCount}/${totalCount} tasks`);

      const statsElement = document.querySelector(
        "#aiSuggestionModal #aiTaskStats"
      );
      if (statsElement) {
        statsElement.innerHTML = `Đã chọn: <strong>${selectedCount}</strong> / <strong>${totalCount}</strong> công việc`;
      }
    },

    getPriorityColor(priority) {
      const colors = {
        1: "#10B981",
        2: "#3B82F6",
        3: "#F59E0B",
        4: "#EF4444",
      };
      return colors[priority] || "#8B5CF6";
    },

    /**
     * ======================================================
     * 3. FORM SUBMIT HANDLING - ĐẦY ĐỦ
     * ======================================================
     */
    setupAllEventListeners() {
      console.log("🔗 Setting up all event listeners...");

      const modal = document.getElementById("aiSuggestionModal");
      if (!modal) return;

      // XÓA TẤT CẢ EVENT LISTENERS CŨ
      const newModal = modal.cloneNode(true);
      modal.parentNode.replaceChild(newModal, modal);

      // Setup các listeners mới
      const currentModal = document.getElementById("aiSuggestionModal");

      // 1. Select all button
      const selectAllBtn = currentModal.querySelector("#selectAllTasksBtn");
      if (selectAllBtn) {
        selectAllBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleSelectAll();
        });
        console.log("✅ Select all button listener added");
      }

      // 2. Form submit listener
      const submitBtn = currentModal.querySelector("#aiSubmitBtn");
      if (submitBtn) {
        submitBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.handleFormSubmitAction();
        });
        console.log("✅ Submit button listener added");
      }

      // 3. Close button listener
      const closeBtn = currentModal.querySelector(".modal-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.closeModal();
        });
      }

      // 4. Modal overlay close
      const overlay = currentModal.querySelector(".modal-overlay");
      if (overlay) {
        overlay.addEventListener("click", () => {
          this.closeModal();
        });
      }

      // 5. Checkbox listeners
      this.setupCheckboxListeners();

      console.log("✅ All event listeners setup complete");
    },

    async handleFormSubmitAction() {
      try {
        console.log("📤 Bắt đầu submit form AI...");

        // TÌM MODAL
        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          this.showError("Không tìm thấy modal AI");
          return;
        }

        // TÌM FORM TRONG MODAL
        const form = modal.querySelector("#aiSuggestionForm");
        if (!form) {
          // Nếu không có form, có thể đang ở preview mode
          const previewContainer = modal.querySelector(".ai-preview-container");
          if (previewContainer) {
            console.log("⚠️ Đang ở preview mode, không xử lý submit form");
            return;
          }
          this.showError("Không tìm thấy form. Vui lòng đóng và mở lại modal.");
          return;
        }

        // LẤY DỮ LIỆU FORM
        const startDate = modal.querySelector("#aiStartDate")?.value;
        const endDate = modal.querySelector("#aiEndDate")?.value;

        if (!startDate || !endDate) {
          this.showError("Vui lòng chọn ngày bắt đầu và kết thúc");
          return;
        }

        // LẤY TASK ĐÃ CHỌN
        const selectedTasks = [];
        const checkboxes = modal.querySelectorAll(".task-checkbox:checked");

        checkboxes.forEach((checkbox) => {
          const taskId = parseInt(checkbox.value);
          if (!isNaN(taskId) && taskId > 0) {
            selectedTasks.push(taskId);
          }
        });

        if (selectedTasks.length === 0) {
          this.showError("Vui lòng chọn ít nhất một công việc");
          return;
        }

        // TẠO PAYLOAD
        const payload = {
          tasks: selectedTasks,
          startDate: `${startDate}T00:00:00`,
          endDate: `${endDate}T23:59:59`,
          options: {
            avoidConflict:
              modal.querySelector("#aiOptionAvoidConflict")?.checked ?? true,
            considerPriority:
              modal.querySelector("#aiOptionConsiderPriority")?.checked ?? true,
            balanceWorkload:
              modal.querySelector("#aiOptionBalanceWorkload")?.checked ?? true,
          },
          additionalInstructions:
            modal.querySelector("#aiAdditionalInstructions")?.value || "",
        };

        console.log("📤 Gửi payload:", payload);

        // HIỂN THỊ LOADING
        this.showFormLoading(true);

        // GỬI REQUEST
        const res = await Utils.makeRequest(
          this.API_ENDPOINTS.suggestSchedule,
          "POST",
          payload
        );

        this.showFormLoading(false);

        if (!res.success) {
          throw new Error(res.message || "Lỗi từ server AI");
        }

        // LƯU FORM DATA
        const modalBody = modal.querySelector(".ai-modal-body");
        if (modalBody) {
          modalBody.dataset.originalFormData = JSON.stringify(payload);
        }

        // HIỂN THỊ PREVIEW
        this.showAIPreview(
          res.data.suggestions,
          res.data.summary,
          res.data.statistics,
          payload
        );
      } catch (error) {
        console.error("❌ Lỗi submit form:", error);
        this.showFormLoading(false);
        this.showError(error.message || "Lỗi xử lý yêu cầu AI");
      }
    },
    async showAIPreview(
      suggestions,
      summary,
      statistics,
      originalFormData = null
    ) {
      try {
        console.log("🎨 Rendering AI preview...");

        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          console.error("❌ Không tìm thấy modal");
          return;
        }

        const modalBody = modal.querySelector(".ai-modal-body");
        if (!modalBody) {
          console.error("❌ Không tìm thấy modal body");
          return;
        }

        // LƯU FORM DATA
        if (originalFormData) {
          modalBody.dataset.originalFormData = JSON.stringify(originalFormData);
        }

        // LẤY THÔNG TIN CÔNG VIỆC ĐỂ HIỂN THỊ TÊN
        let taskDetailsMap = {};
        if (originalFormData?.tasks) {
          try {
            const tasks = await this.loadPendingTasks();
            tasks.forEach((task) => {
              if (originalFormData.tasks.includes(parseInt(task.id))) {
                taskDetailsMap[task.id] = task.title;
              }
            });
          } catch (e) {
            console.warn("⚠️ Không thể load task details:", e);
          }
        }

        // RENDER PREVIEW HTML
        let previewHTML = `
      <div class="ai-preview-container" style="padding: 20px;">
        <!-- Header -->
        <div class="preview-header" style="text-align: center; margin-bottom: 25px;">
          <div style="font-size: 48px; color: #8B5CF6; margin-bottom: 10px;">
            <i class="fas fa-robot"></i>
          </div>
          <h3 style="font-size: 24px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">
            📅 Lịch Trình AI Đề Xuất
          </h3>
          <p style="color: #6b7280; font-size: 16px;">${
            summary || "Lịch trình được tạo tự động bởi AI"
          }</p>
        </div>

        <!-- Statistics -->
        <div class="preview-stats" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
          <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: #8B5CF6;">${
              statistics?.totalTasks || suggestions.length
            }</div>
            <div style="font-size: 14px; color: #6b7280;">Công việc</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: #10B981;">${
              statistics?.totalHours ||
              Math.round(
                suggestions.reduce(
                  (sum, s) => sum + (s.durationMinutes || 60),
                  0
                ) / 60
              )
            }</div>
            <div style="font-size: 14px; color: #6b7280;">Giờ làm việc</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: #F59E0B;">${
              statistics?.daysUsed ||
              new Set(
                suggestions.map((s) => new Date(s.scheduledTime).toDateString())
              ).size
            }</div>
            <div style="font-size: 14px; color: #6b7280;">Ngày</div>
          </div>
        </div>

        <!-- Suggestions List -->
        <div class="suggestions-list-container" style="max-height: 350px; overflow-y: auto; margin-bottom: 25px; padding-right: 10px;">
          <h4 style="font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #374151;">
            <i class="fas fa-list-check"></i> Danh sách đề xuất (${
              suggestions.length
            })
          </h4>
    `;

        // RENDER TỪNG SUGGESTION VỚI TÊN CÔNG VIỆC
        suggestions.forEach((s, index) => {
          const date = new Date(s.scheduledTime);
          const dateStr = date.toLocaleDateString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
          });
          const timeStr = date.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          });

          // LẤY TÊN CÔNG VIỆC
          const taskTitle =
            taskDetailsMap[s.taskId] || s.taskTitle || `Công việc #${s.taskId}`;

          previewHTML += `
        <div class="suggestion-item" style="
          background: white; 
          border-left: 4px solid ${s.color || "#8B5CF6"};
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 12px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          display: flex;
          align-items: flex-start;
        ">
          <div style="margin-right: 15px;">
            <div style="
              width: 36px;
              height: 36px;
              background: ${s.color || "#8B5CF6"};
              color: white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 600;
              font-size: 14px;
            ">${index + 1}</div>
          </div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <strong style="font-size: 16px;">${taskTitle}</strong>
              <span style="font-size: 14px; color: #6b7280;">${
                s.durationMinutes || 60
              } phút</span>
            </div>
            <div style="font-size: 14px; color: #4b5563; margin-bottom: 5px;">
              <i class="far fa-calendar" style="margin-right: 5px;"></i>
              ${dateStr} • ${timeStr}
            </div>
            ${
              s.reason
                ? `
              <div style="font-size: 13px; color: #6b7280; background: #f9fafb; padding: 8px; border-radius: 4px; margin-top: 5px;">
                <i class="fas fa-lightbulb" style="margin-right: 5px; color: #F59E0B;"></i>
                ${s.reason}
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
        });

        // CONTINUE WITH REMAINING HTML...
        previewHTML += `
        </div>

        <!-- Actions -->
        <div class="preview-actions" style="display: flex; justify-content: center; gap: 12px; margin-top: 30px;">
          <button id="aiApplyBtn" class="btn btn-success" style="
            padding: 12px 24px;
            background: #10B981;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <i class="fas fa-check-circle"></i> Áp dụng lịch trình
          </button>
          
          <button id="aiEditBtn" class="btn btn-secondary" style="
            padding: 12px 24px;
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <i class="fas fa-edit"></i> Chỉnh sửa yêu cầu
          </button>
          
          <button id="aiBackBtn" class="btn btn-outline" style="
            padding: 12px 24px;
            background: transparent;
            color: #6b7280;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <i class="fas fa-arrow-left"></i> Quay lại
          </button>
        </div>

        <!-- Edit Section (hidden by default) -->
        <div id="aiEditSection" style="
          display: none;
          margin-top: 30px;
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        ">
          <h5 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #374151;">
            <i class="fas fa-comment-dots"></i> Hướng dẫn chỉnh sửa cho AI
          </h5>
          <p style="font-size: 14px; color: #6b7280; margin-bottom: 15px;">
            Mô tả chi tiết các thay đổi bạn muốn AI điều chỉnh trong lịch trình
          </p>
          
          <textarea id="aiAdditionalInstructions" 
            placeholder="Ví dụ: 
• Chuyển công việc sang buổi sáng
• Giảm thời gian công việc xuống 45 phút
• Tránh xếp việc vào thứ 6 chiều
• Ưu tiên công việc quan trọng trước"
            style="
              width: 100%;
              height: 120px;
              padding: 12px;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              font-size: 14px;
              resize: vertical;
              margin-bottom: 15px;
            ">${originalFormData?.additionalInstructions || ""}</textarea>
          
          <div style="display: flex; gap: 10px;">
            <button id="aiResubmitBtn" class="btn btn-primary" style="
              padding: 10px 20px;
              background: #3B82F6;
              color: white;
              border: none;
              border-radius: 6px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <i class="fas fa-paper-plane"></i> Gửi lại cho AI
            </button>
            
            <button id="aiCancelEditBtn" class="btn btn-outline" style="
              padding: 10px 20px;
              background: transparent;
              color: #6b7280;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              font-weight: 600;
              cursor: pointer;
            ">
              Hủy
            </button>
          </div>
        </div>

        <!-- Note -->
        <div style="
          margin-top: 20px;
          padding: 12px;
          background: #e0e7ff;
          border-radius: 6px;
          border-left: 4px solid #8B5CF6;
          font-size: 14px;
          color: #4f46e5;
        ">
          <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
          Lịch trình sẽ được thêm vào tab Lịch AI và hiển thị trên calendar
        </div>
      </div>
    `;

        modalBody.innerHTML = previewHTML;
        console.log("✅ Preview rendered successfully");

        // SETUP EVENT LISTENERS
        this.setupPreviewEventListeners(originalFormData, suggestions);
      } catch (error) {
        console.error("❌ Error rendering AI preview:", error);
        this.showError("Lỗi hiển thị preview: " + error.message);
      }
    },

    // HÀM HELPER MỚI: Thiết lập event listeners cho preview
    setupPreviewEventListeners(originalFormData, suggestions) {
      const modalBody = document.querySelector(
        "#aiSuggestionModal .ai-modal-body"
      );
      if (!modalBody) return;

      // Sử dụng event delegation để tránh lỗi null
      modalBody.addEventListener("click", (event) => {
        const target = event.target;
        const button = target.closest("button");

        if (!button) return;

        const buttonId = button.id;

        switch (buttonId) {
          case "aiApplyBtn":
            event.preventDefault();
            this.applyAISuggestions(suggestions);
            break;

          case "aiEditBtn":
            event.preventDefault();
            document.getElementById("aiEditSection").style.display = "block";
            break;

          case "aiBackBtn":
            event.preventDefault();
            this.resetToFormView();
            break;

          case "aiResubmitBtn":
            event.preventDefault();
            this.resubmitWithInstructions(originalFormData);
            break;

          case "aiCancelEditBtn":
            event.preventDefault();
            document.getElementById("aiEditSection").style.display = "none";
            break;
        }
      });
    },

    // HÀM MỚI: Áp dụng suggestions
    async applyAISuggestions(suggestions) {
      try {
        console.log("📤 Applying AI suggestions...", suggestions.length);

        if (!suggestions || suggestions.length === 0) {
          this.showError("Không có đề xuất nào để áp dụng");
          return;
        }

        // HIỂN THỊ LOADING
        const applyBtn = document.getElementById("aiApplyBtn");
        if (applyBtn) {
          applyBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Đang áp dụng...';
          applyBtn.disabled = true;
        }

        // 1. LƯU VÀO DATABASE
        const saveResult = await this.saveAISuggestionsToDatabase(suggestions);

        if (!saveResult.success) {
          throw new Error(saveResult.message || "Lỗi lưu vào database");
        }

        // 2. LOAD VÀO CALENDAR AI
        if (window.AIModule && window.AIModule.loadAISuggestions) {
          await AIModule.loadAISuggestions(suggestions);
        }

        // 3. REFRESH CALENDAR
        if (window.AIModule && window.AIModule.refreshFromDatabase) {
          await AIModule.refreshFromDatabase();
        }

        // 4. HIỂN THỊ THÀNH CÔNG
        this.showSuccess(`✅ Đã áp dụng ${suggestions.length} lịch trình AI!`);

        // 5. ĐÓNG MODAL VÀ RESET FORM
        setTimeout(() => {
          // RESET FORM TRƯỚC KHI ĐÓNG
          this.resetModalForm();

          // ĐÓNG MODAL
          const modal = document.getElementById("aiSuggestionModal");
          if (modal) {
            modal.classList.remove("active", "show");
            modal.style.display = "none";
            document.body.classList.remove("modal-open");
          }

          // CHUYỂN SANG TAB AI
          setTimeout(() => {
            document.querySelector('[data-tab="ai"]')?.click();
          }, 300);
        }, 1500);
      } catch (error) {
        console.error("❌ Error applying suggestions:", error);
        this.showError("Lỗi áp dụng lịch trình: " + error.message);

        // RESET BUTTON
        const applyBtn = document.getElementById("aiApplyBtn");
        if (applyBtn) {
          applyBtn.innerHTML =
            '<i class="fas fa-check-circle"></i> Áp dụng lịch trình';
          applyBtn.disabled = false;
        }
      }
    },

    resetModalForm() {
      console.log("🔄 Resetting AI modal form...");

      try {
        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          console.warn("⚠️ Modal không tồn tại");
          return;
        }

        // RESET TASK LIST
        const taskList = modal.querySelector("#aiTaskList");
        if (taskList) {
          taskList.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
          </div>
          <p>Đang tải công việc...</p>
        </div>
      `;
        }

        // RESET STATS
        const statsElement = modal.querySelector("#aiTaskStats");
        if (statsElement) {
          statsElement.innerHTML = `Đã chọn: <strong>0</strong> công việc`;
        }

        // RESET DATES
        this.setDefaultDates();

        // RESET CHECKBOXES
        const checkboxes = modal.querySelectorAll(".task-checkbox");
        checkboxes.forEach((cb) => {
          cb.checked = false;
        });

        // RESET TASK ITEMS UI
        const taskItems = modal.querySelectorAll(".task-item.selectable");
        taskItems.forEach((item) => {
          item.dataset.selected = "false";
          item.classList.remove("selected");
        });

        // RESET FORM
        const form = modal.querySelector("#aiSuggestionForm");
        if (form) {
          form.reset();
        }

        // RESET EDIT SECTION
        const editSection = modal.querySelector("#aiEditSection");
        if (editSection) {
          editSection.style.display = "none";
        }

        console.log("✅ Modal form reset complete");
      } catch (error) {
        console.error("❌ Error resetting modal form:", error);
      }
    },

    async resubmitWithInstructions(originalFormData = null) {
      try {
        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          this.showError("Modal không tồn tại");
          return;
        }

        const modalBody = modal.querySelector(".ai-modal-body");
        if (!modalBody) {
          this.showError("Không tìm thấy modal body");
          return;
        }

        // LẤY ORIGINAL FORM DATA NẾU KHÔNG CÓ
        if (!originalFormData) {
          const savedData = modalBody.dataset.originalFormData;
          if (savedData) {
            try {
              originalFormData = JSON.parse(savedData);
              console.log("📋 Lấy lại form data từ dataset:", originalFormData);
            } catch (e) {
              console.error("❌ Lỗi parse form data:", e);
              this.showError("Không thể khôi phục dữ liệu form");
              return;
            }
          } else {
            this.showError(
              "Không tìm thấy dữ liệu form gốc. Vui lòng tạo lại yêu cầu."
            );
            return;
          }
        }

        // LẤY INSTRUCTIONS
        const instructionsInput = modal.querySelector(
          "#aiAdditionalInstructions"
        );
        const instructions = instructionsInput?.value?.trim() || "";

        if (!instructions.trim()) {
          this.showError("Vui lòng nhập hướng dẫn chỉnh sửa");
          return;
        }

        // CẬP NHẬT PAYLOAD VỚI INSTRUCTIONS MỚI
        const payload = {
          ...originalFormData,
          additionalInstructions: instructions,
        };

        console.log("🔄 Resubmitting với instructions:", payload);

        // HIỂN THỊ LOADING
        const resubmitBtn = modal.querySelector("#aiResubmitBtn");
        const editSection = modal.querySelector("#aiEditSection");
        const originalBtnHTML = resubmitBtn?.innerHTML;

        if (resubmitBtn) {
          resubmitBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
          resubmitBtn.disabled = true;
        }

        try {
          // GỬI LẠI REQUEST
          const res = await Utils.makeRequest(
            this.API_ENDPOINTS.suggestSchedule,
            "POST",
            payload
          );

          if (!res.success) {
            throw new Error(res.message || "Lỗi từ server AI");
          }

          // ẨN EDIT SECTION
          if (editSection) {
            editSection.style.display = "none";
          }

          // CẬP NHẬT ORIGINAL FORM DATA VỚI INSTRUCTIONS MỚI
          payload.additionalInstructions = instructions;
          modalBody.dataset.originalFormData = JSON.stringify(payload);

          // HIỂN THỊ PREVIEW MỚI
          this.showAIPreview(
            res.data.suggestions,
            res.data.summary,
            res.data.statistics,
            payload
          );
        } catch (error) {
          console.error("❌ Lỗi resubmit:", error);
          this.showError(error.message || "Lỗi gửi lại yêu cầu AI");
        } finally {
          // RESET BUTTON
          if (resubmitBtn) {
            resubmitBtn.innerHTML =
              originalBtnHTML ||
              '<i class="fas fa-paper-plane"></i> Gửi lại cho AI';
            resubmitBtn.disabled = false;
          }
        }
      } catch (error) {
        console.error("❌ Error resubmitting:", error);
        this.showError("Lỗi gửi lại yêu cầu: " + error.message);
      }
    },

    resetToFormView() {
      try {
        console.log("🔄 Resetting to form view...");

        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          console.error("❌ Không tìm thấy modal");
          this.showError("Modal không tồn tại");
          return;
        }

        const modalBody = modal.querySelector(".ai-modal-body");
        if (!modalBody) {
          console.error("❌ Không tìm thấy modal body");
          this.showError("Không thể reset form");
          return;
        }

        // XÓA DỮ LIỆU CŨ
        delete modalBody.dataset.originalFormData;
        delete modalBody.dataset.suggestions;

        // TẠO LẠI FORM HTML
        modalBody.innerHTML = `
      <form id="aiSuggestionForm">
        <!-- Date Range Section -->
        <div class="form-section">
          <div class="section-title">
            <i class="fas fa-calendar-alt"></i>
            <span>Chọn Khoảng Thời Gian</span>
          </div>
          <div class="date-range-grid">
            <div class="form-group">
              <label class="form-label">Từ ngày</label>
              <input type="date" id="aiStartDate" class="date-input" required />
            </div>
            <div class="form-group">
              <label class="form-label">Đến ngày</label>
              <input type="date" id="aiEndDate" class="date-input" required />
            </div>
          </div>
        </div>

        <!-- Task Selection Section -->
        <div class="form-section">
          <div class="section-header">
            <div class="section-title">
              <i class="fas fa-tasks"></i>
              <span>Chọn Công Việc</span>
            </div>
            <button type="button" class="btn-select-all" id="selectAllTasksBtn">
              <i class="fas fa-check-double"></i>
              <span>Chọn tất cả</span>
            </button>
          </div>

          <div class="task-list-container">
            <div class="task-list" id="aiTaskList">
              <div class="loading-state">
                <div class="loading-spinner">
                  <i class="fas fa-spinner fa-spin"></i>
                </div>
                <p>Đang tải công việc...</p>
              </div>
            </div>

            <div class="task-stats" id="aiTaskStats">
              Đã chọn: <strong>0</strong> công việc
            </div>
          </div>
        </div>

        <!-- AI Options Section -->
        <div class="form-section">
          <div class="section-title">
            <i class="fas fa-sliders-h"></i>
            <span>Tùy Chọn AI</span>
          </div>

          <div class="ai-options-grid">
            <label class="ai-option">
              <input type="checkbox" id="aiOptionAvoidConflict" checked />
              <div class="option-content">
                <div class="option-icon">
                  <i class="fas fa-shield-alt"></i>
                </div>
                <div class="option-text">
                  <strong>Tránh trùng lịch</strong>
                  <small>Không xếp vào khung giờ đã có</small>
                </div>
              </div>
            </label>

            <label class="ai-option">
              <input type="checkbox" id="aiOptionConsiderPriority" checked />
              <div class="option-content">
                <div class="option-icon">
                  <i class="fas fa-star"></i>
                </div>
                <div class="option-text">
                  <strong>Ưu tiên quan trọng</strong>
                  <small>Xếp việc quan trọng trước</small>
                </div>
              </div>
            </label>

            <label class="ai-option">
              <input type="checkbox" id="aiOptionBalanceWorkload" checked />
              <div class="option-content">
                <div class="option-icon">
                  <i class="fas fa-balance-scale"></i>
                </div>
                <div class="option-text">
                  <strong>Cân bằng khối lượng</strong>
                  <small>Phân đều công việc các ngày</small>
                </div>
              </div>
            </label>
          </div>
        </div>
      </form>
    `;

        // SETUP LẠI FORM
        this.setDefaultDates();

        // LOAD TASKS VÀ SETUP EVENTS
        setTimeout(async () => {
          await this.populateAIModal();
          this.setupAllEventListeners();
          console.log("✅ Form đã được reset thành công");
        }, 100);
      } catch (error) {
        console.error("❌ Error resetting to form view:", error);
        this.showError("Lỗi khi reset form: " + error.message);
      }
    },

    // 3. SỬA HÀM applyAISuggestions
    async applyAISuggestions(suggestions) {
      try {
        console.log("📤 Applying AI suggestions...", suggestions.length);

        if (!suggestions || suggestions.length === 0) {
          this.showError("Không có đề xuất nào để áp dụng");
          return;
        }

        // HIỂN THỊ LOADING
        const applyBtn = document.getElementById("aiApplyBtn");
        if (applyBtn) {
          const originalHTML = applyBtn.innerHTML;
          applyBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Đang áp dụng...';
          applyBtn.disabled = true;

          try {
            // 1. LƯU VÀO DATABASE
            const saveResult = await this.saveAISuggestionsToDatabase(
              suggestions
            );

            if (!saveResult.success) {
              throw new Error(saveResult.message || "Lỗi lưu vào database");
            }

            // 2. LOAD VÀO CALENDAR AI
            if (window.AIModule && window.AIModule.loadAISuggestions) {
              await AIModule.loadAISuggestions(suggestions);
            }

            // 3. REFRESH CALENDAR
            if (window.AIModule && window.AIModule.refreshFromDatabase) {
              await AIModule.refreshFromDatabase();
            }

            // 4. HIỂN THỊ THÀNH CÔNG
            this.showSuccess(
              `✅ Đã áp dụng ${suggestions.length} lịch trình AI!`
            );

            // 5. ĐÓNG MODAL VÀ RESET FORM
            setTimeout(() => {
              // ĐÓNG MODAL
              ModalManager.hideModalById("aiSuggestionModal");

              // RESET FORM SAU KHI ĐÓNG
              setTimeout(() => {
                this.resetModalForm();
              }, 300);

              // CHUYỂN SANG TAB AI
              setTimeout(() => {
                document.querySelector('[data-tab="ai"]')?.click();
              }, 500);
            }, 1500);
          } finally {
            // RESET BUTTON
            applyBtn.innerHTML = originalHTML;
            applyBtn.disabled = false;
          }
        }
      } catch (error) {
        console.error("❌ Error applying suggestions:", error);
        this.showError("Lỗi áp dụng lịch trình: " + error.message);
      }
    },

    resetModalForm() {
      console.log("🔄 Resetting AI modal form...");

      try {
        const modal = document.getElementById("aiSuggestionModal");
        if (!modal) {
          console.warn("⚠️ Modal không tồn tại");
          return;
        }

        // NẾU ĐANG Ở PREVIEW MODE, RESET VỀ FORM VIEW
        const previewContainer = modal.querySelector(".ai-preview-container");
        if (previewContainer) {
          this.resetToFormView();
          return;
        }

        // RESET TASK LIST
        const taskList = modal.querySelector("#aiTaskList");
        if (taskList) {
          taskList.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
          </div>
          <p>Đang tải công việc...</p>
        </div>
      `;
        }

        // RESET STATS
        const statsElement = modal.querySelector("#aiTaskStats");
        if (statsElement) {
          statsElement.innerHTML = `Đã chọn: <strong>0</strong> công việc`;
        }

        // RESET DATES
        this.setDefaultDates();

        // RESET CHECKBOXES
        const checkboxes = modal.querySelectorAll(".task-checkbox");
        checkboxes.forEach((cb) => {
          cb.checked = false;
        });

        // RESET TASK ITEMS UI
        const taskItems = modal.querySelectorAll(".task-item.selectable");
        taskItems.forEach((item) => {
          item.dataset.selected = "false";
          item.classList.remove("selected");
        });

        // RESET FORM INPUTS
        const form = modal.querySelector("#aiSuggestionForm");
        if (form) {
          form.reset();
        }

        // LOAD LẠI TASKS
        setTimeout(() => {
          this.populateAIModal();
        }, 100);

        console.log("✅ Modal form reset complete");
      } catch (error) {
        console.error("❌ Error resetting modal form:", error);
      }
    },

    getFormData() {
      try {
        console.log("🔍 Getting form data...");

        // Lấy từ data-selected thay vì checkbox
        const selectedItems = document.querySelectorAll(
          '#aiSuggestionModal .task-item[data-selected="true"]'
        );

        const selectedTasks = [];
        selectedItems.forEach((item, index) => {
          const taskId = item.dataset.taskId;
          if (taskId) {
            const parsedId = parseInt(taskId);
            if (!isNaN(parsedId) && parsedId > 0) {
              selectedTasks.push(parsedId);
              console.log(`✅ Task ${index + 1}: ID = ${parsedId}`);
            }
          }
        });

        console.log(`📋 Total selected tasks: ${selectedTasks.length}`);
        console.log(`📋 Task IDs:`, selectedTasks);

        if (selectedTasks.length === 0) {
          this.showError("Vui lòng chọn ít nhất một công việc!");
          return null;
        }

        // Phần còn lại giữ nguyên...
        const startDate = document.getElementById("aiStartDate")?.value;
        const endDate = document.getElementById("aiEndDate")?.value;

        if (!startDate || !endDate) {
          this.showError("Vui lòng chọn khoảng thời gian!");
          return null;
        }

        const options = {
          avoidConflict:
            document.getElementById("aiOptionAvoidConflict")?.checked !== false,
          considerPriority:
            document.getElementById("aiOptionConsiderPriority")?.checked !==
            false,
          balanceWorkload:
            document.getElementById("aiOptionBalanceWorkload")?.checked !==
            false,
        };

        const formData = {
          tasks: selectedTasks,
          startDate,
          endDate,
          options,
        };

        console.log("✅ Form data ready:", formData);
        return formData;
      } catch (error) {
        console.error("❌ Error getting form data:", error);
        this.showError("Lỗi lấy dữ liệu form: " + error.message);
        return null;
      }
    },

    validateFormData(formData) {
      if (!formData.tasks || formData.tasks.length === 0) {
        this.showError("Vui lòng chọn ít nhất một công việc!");
        return false;
      }

      if (!formData.startDate || !formData.endDate) {
        this.showError("Vui lòng chọn khoảng thời gian!");
        return false;
      }

      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (end <= start) {
        this.showError("Ngày kết thúc phải sau ngày bắt đầu!");
        return false;
      }

      const invalidTasks = formData.tasks.filter((id) => isNaN(id) || id <= 0);
      if (invalidTasks.length > 0) {
        console.error("Invalid task IDs:", invalidTasks);
        this.showError("Có công việc không hợp lệ. Vui lòng thử lại.");
        return false;
      }

      return true;
    },

    async submitToAI(formData) {
      try {
        console.log("📤 Submitting to AI API...");
        console.log("Request payload:", JSON.stringify(formData, null, 2));

        const token = localStorage.getItem("auth_token");
        if (!token) {
          throw new Error("Không tìm thấy token đăng nhập");
        }

        const response = await fetch("/api/ai/suggest-schedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });

        console.log("📥 AI API response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error response:", errorText);
          throw new Error(
            `HTTP ${response.status}: ${errorText.substring(0, 200)}`
          );
        }

        const result = await response.json();
        console.log("🤖 AI API result:", result);

        if (!result.success) {
          throw new Error(result.message || "Lỗi xử lý AI");
        }

        return {
          success: true,
          data: result.data,
          message: result.message || "Thành công",
        };
      } catch (error) {
        console.error("❌ AI submission error:", error);
        return {
          success: false,
          message: error.message || "Lỗi kết nối AI",
        };
      }
    },

    handleErrorResult(result) {
      console.error("❌ AI error:", result);
      this.showError(result.message || "Lỗi không xác định từ AI");
    },

    async addEventsToCalendar(suggestions) {
      try {
        if (!suggestions || suggestions.length === 0) return;

        console.log(`📅 Adding ${suggestions.length} events to calendar...`);

        // ✅ CHỜ AIModule SẴN SÀNG
        await this.waitForAIModule();

        if (window.AIModule && window.AIModule.loadAISuggestions) {
          console.log("🔄 Calling AIModule.loadAISuggestions...");
          await AIModule.loadAISuggestions(suggestions);
          console.log("✅ Events added to AI calendar successfully");
        } else {
          console.warn("⚠️ AIModule not available for adding events");
          this.showError("Không thể thêm lịch vào AI calendar");
        }
      } catch (error) {
        console.error("❌ Error adding events to calendar:", error);
        this.showError("Lỗi thêm sự kiện vào lịch: " + error.message);
      }
    },

    /**
     * CHỜ AIModule SẴN SÀNG
     */
    async waitForAIModule(timeout = 10000) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
          if (
            window.AIModule &&
            window.AIModule.isInitialized &&
            window.AIModule.calendar
          ) {
            console.log("✅ AIModule is ready");
            resolve(true);
          } else if (Date.now() - startTime > timeout) {
            console.error("❌ AIModule timeout");
            reject(new Error("AIModule không sẵn sàng sau " + timeout + "ms"));
          } else {
            console.log("⏳ Waiting for AIModule...");
            setTimeout(check, 200);
          }
        };

        check();
      });
    },

    async saveAISuggestionsToDatabase(suggestions) {
      try {
        console.log(`Saving ${suggestions.length} AI suggestions (batch)...`);
        const token = localStorage.getItem("auth_token");
        if (!token) throw new Error("Không có token");

        const res = await fetch("/api/ai/save-ai-suggestions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ suggestions }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        return { success: true, savedCount: data.saved || suggestions.length };
      } catch (err) {
        console.error("Lưu AI thất bại:", err);
        throw err;
      }
    },

    /**
     * ✅ CẬP NHẬT handleSuccessResult ĐỂ LƯU VÀO DATABASE
     */
    async handleSuccessResult(result, formData) {
      console.log("AI thành công, đang lưu vào database...");
      this.displaySuccessResults(result.data);

      if (result.data?.suggestions?.length > 0) {
        try {
          const saveResult = await this.saveAISuggestionsToDatabase(
            result.data.suggestions
          );

          // Chờ AIModule sẵn sàng rồi reload lịch AI
          await this.waitForAIModule();
          if (window.AIModule?.refreshFromDatabase) {
            await AIModule.refreshFromDatabase();
          }

          Utils.showToast(
            `Đã lưu ${saveResult.savedCount} lịch trình AI!`,
            "success"
          );

          setTimeout(() => {
            this.closeModal();
            document.querySelector('[data-tab="ai"]')?.click();
          }, 2000);
        } catch (err) {
          Utils.showToast("Tạo lịch thành công nhưng lưu lỗi!", "warning");
          console.error(err);
        }
      }

      if (window.AIModule && AIModule.refreshFromDatabase) {
        await AIModule.refreshFromDatabase(); // Refresh calendar mà không reload trang
        console.log("✅ Calendar AI đã refresh từ DB");
      } else {
        console.warn("⚠️ AIModule không sẵn sàng, reload trang thủ công");
        location.reload(); // Fallback nếu AIModule lỗi
      }
    },
    /**
     * ======================================================
     * 4. UI HELPERS - ĐẦY ĐỦ
     * ======================================================
     */
    setDefaultDates() {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const startDateInput = document.getElementById("aiStartDate");
      const endDateInput = document.getElementById("aiEndDate");

      if (startDateInput && endDateInput) {
        startDateInput.value = today.toISOString().split("T")[0];
        endDateInput.value = nextWeek.toISOString().split("T")[0];
        console.log(
          "📅 Set default dates:",
          startDateInput.value,
          "to",
          endDateInput.value
        );
      }
    },

    setupCheckboxListeners() {
      const taskList = document.querySelector("#aiSuggestionModal #aiTaskList");
      if (!taskList) return;

      taskList.addEventListener("change", (e) => {
        if (e.target.classList.contains("task-checkbox")) {
          this.updateSelectedCount();
        }
      });
    },

    toggleSelectAll() {
      const checkboxes = document.querySelectorAll(
        "#aiSuggestionModal .task-checkbox"
      );
      const taskItems = document.querySelectorAll(
        "#aiSuggestionModal .task-item.selectable"
      );

      if (checkboxes.length === 0 || taskItems.length === 0) {
        console.warn("⚠️ No checkboxes or task items found");
        return;
      }

      // Kiểm tra xem tất cả đã được chọn chưa
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      const newState = !allChecked;

      console.log(`🔄 Setting all checkboxes to: ${newState}`);

      // Cập nhật checkboxes ẩn
      checkboxes.forEach((cb) => {
        cb.checked = newState;
      });

      // Cập nhật UI và data attributes
      taskItems.forEach((item) => {
        item.dataset.selected = newState.toString();
        if (newState) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
      });

      this.updateSelectedCount();
    },

    updateSelectedCount() {
      const selectedCheckboxes = document.querySelectorAll(
        "#aiSuggestionModal .task-checkbox:checked"
      );
      const selectedCount = selectedCheckboxes.length;
      const totalCount = document.querySelectorAll(
        "#aiSuggestionModal .task-checkbox"
      ).length;

      console.log(`📊 Selected: ${selectedCount}/${totalCount} tasks`);

      const statsElement = document.querySelector(
        "#aiSuggestionModal #aiTaskStats"
      );
      if (statsElement) {
        statsElement.innerHTML = `Đã chọn: <strong>${selectedCount}</strong> công việc`;
      }
    },

    updateTaskStats(count) {
      const statsElement = document.querySelector(
        "#aiSuggestionModal #aiTaskStats"
      );
      if (statsElement) {
        statsElement.innerHTML = `Đã chọn: <strong>0</strong> / <strong>${count}</strong> công việc`;
      }
    },

    showFormLoading(show) {
      const submitBtn = document.getElementById("aiSubmitBtn");

      if (submitBtn) {
        if (show) {
          submitBtn.disabled = true;
          submitBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
          console.log("⏳ Showing loading state...");
        } else {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-magic"></i> Tạo Lịch Trình';
          console.log("✅ Hiding loading state...");
        }
      }
    },

    displaySuccessResults(result) {
      const modalBody = document.querySelector(
        "#aiSuggestionModal .ai-modal-body"
      );
      if (!modalBody) return;

      const successHTML = this.getSuccessHTML(result);
      modalBody.innerHTML = successHTML;

      // Ẩn footer sau khi hiển thị kết quả
      const modalFooter = document.querySelector(
        "#aiSuggestionModal .ai-modal-footer"
      );
      if (modalFooter) {
        modalFooter.style.display = "none";
      }
    },

    closeModal() {
      const modal = document.getElementById("aiSuggestionModal");
      if (modal) {
        // ✅ RESET FORM TRƯỚC KHI ĐÓNG
        this.resetModalForm();

        modal.classList.remove("active", "show");
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        console.log("✅ Modal closed and form reset");

        // Show footer again (if hidden)
        const modalFooter = document.querySelector(
          "#aiSuggestionModal .ai-modal-footer"
        );
        if (modalFooter) {
          modalFooter.style.display = "flex";
        }

        // Dispatch modal closed event
        window.dispatchEvent(
          new CustomEvent("modalClosed", {
            detail: { modalId: "aiSuggestionModal" },
          })
        );
      }
    },

    /**
     * ======================================================
     * 5. HTML TEMPLATES - ĐẦY ĐỦ
     * ======================================================
     */
    getLoadingHTML() {
      return `
      <div class="loading-state" style="text-align: center; padding: 40px;">
        <div class="loading-spinner" style="display: inline-block;">
          <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #8B5CF6;"></i>
        </div>
        <p style="margin-top: 20px; color: #666;">Đang tải danh sách công việc...</p>
      </div>
    `;
    },

    getEmptyStateHTML() {
      return `
      <div class="empty-state" style="text-align: center; padding: 40px;">
        <i class="fas fa-tasks" style="font-size: 48px; color: #ccc; margin-bottom: 20px;"></i>
        <p style="font-size: 16px; color: #666;">Không có công việc nào chưa hoàn thành</p>
        <p class="text-sm text-gray-500 mt-2">Hãy tạo công việc mới trước khi sử dụng AI</p>
      </div>
    `;
    },

    getSuccessHTML(result) {
      const suggestionCount = result.suggestions?.length || 0;
      const summary = result.summary || `Đã tạo ${suggestionCount} khung giờ`;

      let suggestionsHTML = "";
      const previewSuggestions = result.suggestions?.slice(0, 3) || [];

      previewSuggestions.forEach((suggestion) => {
        const date = new Date(suggestion.scheduledTime);
        const timeStr = date.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = date.toLocaleDateString("vi-VN");

        suggestionsHTML += `
        <div class="suggestion-item" style="padding: 15px; margin: 10px 0; border-left: 3px solid #8B5CF6; background: #f9fafb;">
          <i class="far fa-calendar-check" style="color: #8B5CF6; margin-right: 10px;"></i>
          <div class="suggestion-info" style="display: inline-block;">
            <strong>Công việc #${suggestion.taskId}</strong>
            <small style="display: block; color: #666;">${dateStr} lúc ${timeStr} (${
          suggestion.durationMinutes
        } phút)</small>
            <div class="text-xs text-gray-500 mt-1">${
              suggestion.reason || ""
            }</div>
          </div>
        </div>
      `;
      });

      if (suggestionCount > 3) {
        suggestionsHTML += `
        <div class="suggestion-more" style="text-align: center; padding: 15px; color: #666;">
          + ${suggestionCount - 3} đề xuất khác
        </div>
      `;
      }

      const stats = result.statistics || {};

      return `
      <div class="ai-summary-section" style="padding: 20px;">
        <div class="summary-header success" style="text-align: center; margin-bottom: 30px;">
          <i class="fas fa-check-circle" style="font-size: 64px; color: #10B981; margin-bottom: 20px;"></i>
          <h4 style="font-size: 24px; font-weight: 600; margin: 0;">🎉 AI đã tạo lịch trình thành công!</h4>
        </div>
        <p style="text-align: center; font-size: 16px; margin-bottom: 30px;"><strong>${summary}</strong></p>
        
        <div class="ai-stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
          <div class="stat-item" style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px;">
            <i class="fas fa-tasks" style="font-size: 32px; color: #8B5CF6; margin-bottom: 10px;"></i>
            <div>
              <strong style="display: block; font-size: 24px;">${
                stats.totalTasks || suggestionCount
              }</strong>
              <small style="color: #666;">Công việc</small>
            </div>
          </div>
          <div class="stat-item" style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px;">
            <i class="fas fa-clock" style="font-size: 32px; color: #3B82F6; margin-bottom: 10px;"></i>
            <div>
              <strong style="display: block; font-size: 24px;">${
                stats.totalHours || Math.round(suggestionCount * 1.5)
              }</strong>
              <small style="color: #666;">Giờ</small>
            </div>
          </div>
          <div class="stat-item" style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px;">
            <i class="fas fa-calendar-days" style="font-size: 32px; color: #10B981; margin-bottom: 10px;"></i>
            <div>
              <strong style="display: block; font-size: 24px;">${
                stats.daysUsed || 1
              }</strong>
              <small style="color: #666;">Ngày</small>
            </div>
          </div>
        </div>
        
        <div class="suggestions-preview" style="margin-bottom: 30px;">
          <h5 style="font-size: 18px; font-weight: 600; margin-bottom: 15px;">📋 Xem trước đề xuất:</h5>
          <div class="suggestions-list">
            ${suggestionsHTML}
          </div>
        </div>
        
        <div class="summary-note" style="padding: 15px; background: #EEF2FF; border-radius: 8px; margin-bottom: 20px;">
          <i class="fas fa-lightbulb" style="color: #8B5CF6; margin-right: 10px;"></i>
          Những đề xuất này đã được thêm vào lịch AI của bạn
        </div>
        
        <div class="mt-6 text-center">
          <button class="btn btn-primary" onclick="location.reload()" style="padding: 12px 30px; background: #8B5CF6; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
            <i class="fas fa-redo"></i>
            Tải lại trang
          </button>
        </div>
      </div>
    `;
    },

    /**
     * ======================================================
     * 6. UTILITIES - ĐẦY ĐỦ
     * ======================================================
     */
    showError(message) {
      console.error("❌ Error:", message);
      if (window.Utils && Utils.showToast) {
        Utils.showToast(message, "error");
      } else {
        alert("⚠️ " + message);
      }
    },

    showSuccess(message) {
      console.log("✅ Success:", message);
      if (window.Utils && Utils.showToast) {
        Utils.showToast(message, "success");
      }
    },

    showErrorInModal(message) {
      const modalBody = document.querySelector(
        "#aiSuggestionModal .ai-modal-body"
      );
      if (modalBody) {
        modalBody.innerHTML = `
        <div class="error-state" style="text-align: center; padding: 40px;">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>
          <p style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Không thể tải dữ liệu</p>
          <p style="color: #666; margin-bottom: 20px;">${
            message || "Đã xảy ra lỗi"
          }</p>
          <button class="btn btn-primary" onclick="AIHandler.initAIModal()" style="padding: 10px 20px; background: #3B82F6; color: white; border: none; border-radius: 8px; cursor: pointer;">
            <i class="fas fa-redo"></i>
            Thử lại
          </button>
        </div>
      `;
      }
    },

    debugTaskIDs() {
      console.log("🔍 Debugging task IDs in modal...");

      const taskItems = document.querySelectorAll(
        "#aiSuggestionModal .task-item"
      );
      console.log(`Found ${taskItems.length} task items`);

      taskItems.forEach((item, index) => {
        const taskId = item.dataset.taskId;
        const checkbox = item.querySelector(".task-checkbox");

        console.log(`Task ${index}:`, {
          "data-task-id": taskId,
          "checkbox.value": checkbox?.value,
          "checkbox.dataset": checkbox?.dataset,
          "checkbox.checked": checkbox?.checked,
        });
      });

      const checkedBoxes = document.querySelectorAll(
        "#aiSuggestionModal .task-checkbox:checked"
      );
      console.log(`${checkedBoxes.length} checkboxes checked`);

      checkedBoxes.forEach((cb, index) => {
        console.log(
          `Checked ${index}: value="${cb.value}", data-task-id="${cb.dataset.taskId}"`
        );
      });
    },
  };

  window.AIHandler = AIHandler;
  console.log("AIHandler v9.3 đã sẵn sàng và được gắn vào window!");

  // Auto-initialize when modal is shown
  document.addEventListener("modal-shown", (e) => {
    if (e.detail && e.detail.modalId === "aiSuggestionModal") {
      console.log("🎯 AI Modal shown, initializing...");
      setTimeout(() => {
        AIHandler.initAIModal();
      }, 300);
    }
  });

  // Debug function
  window.debugAIHandler = function () {
    console.log("=== AI Handler Debug ===");
    console.log("AIHandler available:", !!window.AIHandler);
    console.log("Methods:", Object.keys(AIHandler));

    const form = document.getElementById("aiSuggestionForm");
    console.log("Form exists:", !!form);

    if (AIHandler.debugTaskIDs) {
      AIHandler.debugTaskIDs();
    }
  };

  console.log("✅ AI Suggestion Handler v9.2 ready");
})();
