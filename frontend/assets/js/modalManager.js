/**
 * ModalManager v2.2 - FULLY FIXED
 * Fixed: dispatchEvent bug + visibility issues
 */

(function () {
  "use strict";

  if (window.ModalManager) {
    console.log("⚠️ ModalManager already exists, replacing...");
    delete window.ModalManager;
  }

  const ModalManager = {
    activeModal: null,
    initialized: false,
    cachedContent: new Map(),

    /**
     * ✅ INIT
     */
    init() {
      if (this.initialized) {
        console.log("ℹ️ ModalManager already initialized");
        return;
      }

      console.log("🎯 ModalManager initialization started");
      this.setupGlobalEventListeners();
      this.initialized = true;
      console.log("✅ ModalManager initialized successfully");
    },

    /**
     * ✅ SHOW MODAL BY ID - FIXED VERSION
     */
    showModalById(modalId) {
      console.log(`🟢 showModalById called for: ${modalId}`);

      const modal = document.getElementById(modalId);
      if (!modal) {
        console.error(`❌ Modal not found: ${modalId}`);
        return false;
      }

      console.log(`✅ Modal found, current classes: ${modal.className}`);

      // 🔥 FORCE INLINE STYLES
      modal.style.display = "flex";
      modal.style.position = "fixed";
      modal.style.top = "0";
      modal.style.left = "0";
      modal.style.width = "100%";
      modal.style.height = "100%";
      modal.style.zIndex = "9999";
      modal.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      modal.style.alignItems = "center";
      modal.style.justifyContent = "center";
      modal.style.opacity = "1";
      modal.style.visibility = "visible";
      modal.style.overflow = "auto"; // ← CRITICAL

      // Add classes
      modal.classList.add("active", "show");

      // Prevent body scroll
      document.body.style.overflow = "hidden";

      this.activeModal = modalId;

      console.log(`🎯 Modal ${modalId} updated classes: ${modal.className}`);
      console.log(`   - Display: ${modal.style.display}`);
      console.log(`   - Opacity: ${modal.style.opacity}`);
      console.log(`   - Visibility: ${modal.style.visibility}`);

      // ✅ FIX: Use window.dispatchEvent, NOT this.dispatchEvent
      window.dispatchEvent(
        new CustomEvent("modalOpened", {
          detail: { modalId },
        })
      );

      // Reinitialize handlers
      this.reinitializeModalHandlers(modal);

      // Verify after a tick
      setTimeout(() => this.verifyModalVisibility(modalId), 100);

      return true;
    },

    /**
     * ✅ VERIFY MODAL VISIBILITY
     */
    verifyModalVisibility(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      const rect = modal.getBoundingClientRect();
      const computed = window.getComputedStyle(modal);

      console.log(`📊 Verification for ${modalId}:`);
      console.log(`   - Width: ${rect.width}px, Height: ${rect.height}px`);
      console.log(`   - Display: ${computed.display}`);
      console.log(`   - Visibility: ${computed.visibility}`);
      console.log(`   - Opacity: ${computed.opacity}`);
      console.log(`   - Z-index: ${computed.zIndex}`);

      if (computed.display === "none") {
        console.error("❌ Modal display is NONE! Forcing flex...");
        modal.style.display = "flex";
      }

      if (parseFloat(computed.opacity) < 1) {
        console.warn("⚠️ Modal opacity < 1, forcing 1");
        modal.style.opacity = "1";
      }

      // Check if modal content is visible
      const content = modal.querySelector(".modal-content");
      if (content) {
        const contentRect = content.getBoundingClientRect();
        console.log(`   - Content rect:`, contentRect);

        if (contentRect.height > window.innerHeight) {
          console.warn(
            "⚠️ Modal content taller than viewport, enabling scroll"
          );
          modal.style.overflow = "auto";
        }
      }
    },

    /**
     * ✅ CLOSE MODAL
     */
    close(modalId) {
      const targetModal = modalId || this.activeModal;
      const modal = document.getElementById(targetModal);

      if (!modal) {
        console.warn(`⚠️ Modal not found for closing: ${targetModal}`);
        return;
      }

      console.log(`🚪 Closing modal: ${targetModal}`);

      // Remove classes
      modal.classList.remove("active", "show");

      // Reset styles
      modal.style.display = "none";
      modal.style.opacity = "0";

      // Restore body scroll
      document.body.style.overflow = "";

      this.activeModal = null;

      // ✅ FIX: Use window.dispatchEvent
      window.dispatchEvent(
        new CustomEvent("modalClosed", {
          detail: { modalId: targetModal },
        })
      );

      console.log(`✅ Modal ${targetModal} closed`);
    },

    /**
     * ✅ SETUP GLOBAL EVENT LISTENERS
     */
    setupGlobalEventListeners() {
      // Close on backdrop click
      document.addEventListener("click", (e) => {
        if (!this.activeModal) return;

        // Kiểm tra nếu modal danh mục đang mở
        const categoryModal = document.getElementById("createCategoryModal");
        const isCategoryModalOpen =
          categoryModal &&
          !categoryModal.classList.contains("hidden") &&
          categoryModal.style.display !== "none";

        // Nếu modal danh mục đang mở, KHÔNG đóng modal chính
        if (isCategoryModalOpen) {
          console.log("⚠️ Category modal is open, ignoring backdrop click");
          return;
        }

        if (e.target.classList.contains("modal") && this.activeModal) {
          console.log("🎯 Backdrop clicked, closing modal");
          this.close(this.activeModal);
        }
      });

      // Close on ESC key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.activeModal) {
          console.log("⌨️ ESC pressed, closing modal");
          this.close(this.activeModal);
        }
      });

      console.log("✅ Global event listeners setup complete");
    },

    /**
     * ✅ REINITIALIZE MODAL HANDLERS
     */
    reinitializeModalHandlers(modal) {
      if (!modal) return;

      console.log(`🔄 Reinitializing handlers for: ${modal.id}`);

      // Close buttons
      const closeButtons = modal.querySelectorAll(
        ".modal-close, [data-modal-close], [id*='cancel'], [id*='close']"
      );

      closeButtons.forEach((btn) => {
        // Remove old listeners by cloning
        const newBtn = btn.cloneNode(true);
        btn.parentNode?.replaceChild(newBtn, btn);

        // Add new listener
        newBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`🎯 Close button clicked in ${modal.id}`);
          this.close(modal.id);
        });
      });

      console.log(`   ✅ Reinitialized ${closeButtons.length} close buttons`);
    },

    /**
     * ✅ UTILITY: Show create task modal
     */
    showCreateTaskModal() {
      return this.showModalById("createTaskModal");
    },

    showCreateTaskModal(taskData = null) {
      const modal = document.getElementById("createTaskModal");
      if (!modal) {
        console.error("❌ Create task modal not found");
        return;
      }

      // Hiển thị modal
      modal.classList.add("active", "show");
      modal.classList.remove("hidden");

      // Trigger event
      document.dispatchEvent(
        new CustomEvent("modalShown", {
          detail: { modalId: "createTaskModal" },
        })
      );

      // Load categories
      if (window.loadCategoriesForModal) {
        setTimeout(() => {
          window.loadCategoriesForModal();
        }, 100);
      }

      // Nếu có taskData, fill vào form
      if (taskData && window.fillTaskForm) {
        window.fillTaskForm(taskData);
      }
    },

    hideModal(modalId) {
      this.close(modalId);
    },

    hideModalById(modalId) {
      this.close(modalId);
    },

    /**
     *
     * ✅ DEBUG HELPER
     */
    debug() {
      console.log("=== MODAL MANAGER DEBUG ===");
      console.log("Initialized:", this.initialized);
      console.log("Active modal:", this.activeModal);

      const modals = document.querySelectorAll(".modal");
      console.log(`\nFound ${modals.length} modals:`);

      modals.forEach((modal) => {
        const computed = window.getComputedStyle(modal);
        const rect = modal.getBoundingClientRect();

        console.log(`\n📦 ${modal.id}:`);
        console.log("  Classes:", modal.className);
        console.log("  Display:", computed.display);
        console.log("  Visibility:", computed.visibility);
        console.log("  Opacity:", computed.opacity);
        console.log("  Z-index:", computed.zIndex);
        console.log("  Position:", computed.position);
        console.log("  Dimensions:", `${rect.width}x${rect.height}`);
      });

      console.log("\n========================");
    },
  };

  // Export to window
  window.ModalManager = ModalManager;

  // Debug helpers
  window.testModal = (modalId = "createTaskModal") => {
    console.log(`🧪 Testing modal: ${modalId}`);
    ModalManager.showModalById(modalId);
  };

  window.debugModals = () => ModalManager.debug();

  console.log("✅ ModalManager v2.2 loaded");
})();
