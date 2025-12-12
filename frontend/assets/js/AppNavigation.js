/**
 * AppNavigation Module - Handles page navigation and section switching
 * COMPLETELY NEW FILE - Renamed to avoid Native Navigation API conflict
 */

(function () {
  "use strict";

  // ✅ CHECK NEW NAME
  if (window.AppNavigation) {
    console.log("⏭️ AppNavigation already loaded");
    return;
  }

  const AppNavigation = {
    currentSection: null,
    initialized: false,
    navButtons: null,
    sections: null,

    init() {
      if (this.initialized) {
        console.log("ℹ️ AppNavigation already initialized");
        return;
      }

      console.log("🔧 AppNavigation.init() called");

      this.navButtons = document.querySelectorAll("[data-section]");
      this.sections = document.querySelectorAll(".section");

      if (this.navButtons.length === 0) {
        console.error("❌ No navigation buttons found with [data-section]!");
        return;
      }

      if (this.sections.length === 0) {
        console.error("❌ No sections found with .section class!");
        return;
      }

      console.log(`✅ Found ${this.navButtons.length} nav buttons`);
      console.log(`✅ Found ${this.sections.length} sections`);

      this.bindEvents();
      this.ensureSingleActiveSection();
      this.initialized = true;

      console.log("✅ AppNavigation initialized successfully");
      console.log(`   Current section: ${this.currentSection}`);
    },

    // THAY THẾ hàm cleanupCurrentSection trong AppNavigation.js
    async cleanupCurrentSection() {
      if (!this.currentSection) return;

      console.log(`🧹 Cleaning up: ${this.currentSection}`);

      const cleanupMap = {
        schedule: () => {
          if (window.CalendarModule && CalendarModule.destroy) {
            CalendarModule.destroy();
          }
        },
        work: () => {
          if (window.WorkManager && WorkManager.cleanup) {
            WorkManager.cleanup();
          }
        },
        salary: () => {
          if (window.SalaryManager && SalaryManager.cleanup) {
            SalaryManager.cleanup();
          }
        },
        profile: () => {
          if (window.ProfileManager && ProfileManager.cleanup) {
            ProfileManager.cleanup();
          }
        },
        ai: () => {
          // ⚠️ QUAN TRỌNG: KHÔNG destroy AI calendar khi chuyển tab
          // Chỉ ẩn nó đi và lưu trạng thái
          console.log("🤖 AI tab: Keeping calendar alive, just hiding");

          // Chỉ ẩn calendar container (không destroy)
          const aiCalendar = document.getElementById("ai-calendar");
          if (aiCalendar && window.AIModule && AIModule.calendar) {
            // Lưu trạng thái hiện tại
            if (AIModule.calendar) {
              AIModule.lastView = AIModule.currentView;
              AIModule.lastDate = AIModule.calendar.getDate();
            }

            // Chỉ ẩn đi (không destroy)
            aiCalendar.style.opacity = "0";
            aiCalendar.style.pointerEvents = "none";
            aiCalendar.style.position = "absolute";
            aiCalendar.style.left = "-9999px";
          }
        },
      };

      if (cleanupMap[this.currentSection]) {
        cleanupMap[this.currentSection]();
      }
    },

    ensureSingleActiveSection() {
      let activeFound = false;
      this.sections.forEach((section) => {
        if (section.classList.contains("active")) {
          if (activeFound) {
            section.classList.remove("active");
            console.log(`⚠️ Removed duplicate active from: ${section.id}`);
          } else {
            activeFound = true;
            this.currentSection = section.id.replace("-section", "");
            console.log(`✅ Active section: ${this.currentSection}`);
          }
        }
      });

      if (!activeFound && this.sections.length > 0) {
        const scheduleSection = document.getElementById("schedule-section");
        if (scheduleSection) {
          scheduleSection.classList.add("active");
          this.currentSection = "schedule";
          console.log("✅ Set schedule as default active section");
        }
      }
    },

    bindEvents() {
      console.log("🔗 Binding navigation events...");

      this.navButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          this.handleNavigation(btn);
        });
        console.log(`  ✅ Bound click event: ${btn.dataset.section}`);
      });

      console.log("✅ All navigation events bound");
    },

    async handleNavigation(btn) {
      const targetSection = btn.dataset.section;
      console.log(`🖱️ Navigation clicked: ${targetSection}`);
      console.log(`   Current section: ${this.currentSection}`);

      if (targetSection === this.currentSection) {
        console.log("⏭️ Already on this section, skipping");
        return;
      }

      await this.navigateToSection(targetSection);
    },

    async navigateToSection(sectionName) {
      try {
        console.log(`🔄 Navigating to section: ${sectionName}`);

        const previousSection = this.currentSection;

        await this.cleanupCurrentSection();
        this.updateNavButtons(sectionName);
        this.toggleSections(sectionName);
        await this.loadAndInitSection(sectionName);

        this.currentSection = sectionName;

        // ✅ DISPATCH CUSTOM EVENT KHI CHUYỂN TAB
        const event = new CustomEvent("section-changed", {
          detail: {
            section: sectionName,
            previousSection: previousSection,
            timestamp: new Date().toISOString(),
          },
        });
        document.dispatchEvent(event);
        console.log(`📢 Dispatched section-changed event for: ${sectionName}`);

        console.log(`✅ Navigation to ${sectionName} completed`);
      } catch (error) {
        console.error(`❌ Navigation to ${sectionName} failed:`, error);

        // Optional: Dispatch an error event
        const errorEvent = new CustomEvent("section-change-error", {
          detail: {
            section: sectionName,
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        });
        document.dispatchEvent(errorEvent);
      }
    },

    updateNavButtons(targetSection) {
      console.log(`🔘 Updating nav buttons for: ${targetSection}`);

      this.navButtons.forEach((btn) => {
        btn.classList.remove("bg-gray-300", "text-gray-900", "bg-gray-200");
        btn.classList.add("text-gray-600", "hover:bg-gray-100");
        btn.removeAttribute("aria-current");
      });

      const targetBtn = document.querySelector(
        `[data-section="${targetSection}"]`
      );
      if (targetBtn) {
        targetBtn.classList.add("bg-gray-200", "text-gray-900");
        targetBtn.classList.remove("text-gray-600", "hover:bg-gray-100");
        targetBtn.setAttribute("aria-current", "page");
        console.log(`✅ Updated button: ${targetSection}`);
      }
    },

    toggleSections(targetSection) {
      console.log(`🔀 Toggling sections to: ${targetSection}`);

      this.sections.forEach((section) => {
        section.classList.remove("active");
      });

      const targetSectionEl = document.getElementById(
        `${targetSection}-section`
      );
      if (targetSectionEl) {
        targetSectionEl.classList.add("active");
        console.log(`✅ Activated section: ${targetSection}-section`);
      } else {
        console.error(`❌ Section not found: ${targetSection}-section`);
      }
    },

    async loadAndInitSection(sectionName) {
      const containerId = `${sectionName}-section`;
      const container = document.getElementById(containerId);

      if (!container) {
        console.error(`❌ Container not found: ${containerId}`);
        return;
      }

      console.log(`📦 Loading content for: ${sectionName}`);

      // LUÔN load content qua ComponentLoader (đơn giản hóa)
      if (window.ComponentLoader && ComponentLoader.loadPageContent) {
        console.log(`🔥 Loading content via ComponentLoader...`);
        await ComponentLoader.loadPageContent(sectionName);
      } else {
        console.error(
          `❌ ComponentLoader not available or missing loadPageContent`
        );
        return;
      }

      // Re-initialize modals và event handlers
      if (window.ModalManager) {
        setTimeout(() => {
          if (window.ModalManager.reinitializeEventHandlers) {
            ModalManager.reinitializeEventHandlers();
          }
        }, 100);
      }

      // Update user info
      if (window.App && window.App.updateUserInfo) {
        setTimeout(() => window.App.updateUserInfo(), 100);
      }

      // Section-specific refresh logic
      setTimeout(() => {
        if (sectionName === "schedule" && window.CalendarModule) {
          console.log("🔄 Refreshing calendar...");
          CalendarModule.refreshEvents && CalendarModule.refreshEvents();
          CalendarModule.refreshDragDrop && CalendarModule.refreshDragDrop();
        } else if (sectionName === "work") {
          console.log("🔄 WORK SECTION - Ensuring tasks are loaded...");

          // Dispatch event để sidebar và các module khác biết
          const workEvent = new CustomEvent("work-tab-activated");
          document.dispatchEvent(workEvent);

          // Đảm bảo WorkManager được init và load tasks
          if (window.WorkManager) {
            if (!WorkManager.initialized && WorkManager.init) {
              console.log("🔧 WorkManager not initialized, calling init()");
              WorkManager.init();
            } else if (WorkManager.loadTasks) {
              console.log(
                "📥 WorkManager already initialized, calling loadTasks()"
              );
              WorkManager.loadTasks();
            }
          }

          // Setup drag & drop cho tasks mới
          if (CalendarModule && CalendarModule.setupNativeDragDrop) {
            setTimeout(() => {
              CalendarModule.setupNativeDragDrop();
              CalendarModule.setupExternalDraggable();
            }, 800);
          }
        } else if (sectionName === "ai" && window.AIModule) {
          console.log("🔄 Refreshing AI suggestions...");
          AIModule.refreshSuggestions && AIModule.refreshSuggestions();

          if (AIModule.restoreCalendar) {
            setTimeout(() => {
              AIModule.restoreCalendar();
            }, 200);
          }
        }
      }, 200);

      // Scroll to top
      window.scrollTo(0, 0);

      console.log(`✅ Section ${sectionName} initialized successfully`);
    },

    async refreshCurrentSection() {
      if (this.currentSection) {
        await this.loadAndInitSection(this.currentSection);
      }
    },
  };

  // ✅ EXPOSE WITH NEW NAME
  window.AppNavigation = AppNavigation;

  console.log("✅ AppNavigation loaded and ready");
  console.log("   Available methods:", Object.keys(AppNavigation));
})();
