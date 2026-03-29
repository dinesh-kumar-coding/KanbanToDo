/**
 * =========================================
 * KANBAN PRO - CORE APPLICATION
 * =========================================
 */

class KanbanApp {
    constructor() {
        if (!this.cacheDOM()) {
            console.error('KanbanApp Initialization Failed: Missing critical DOM elements.');
            return;
        }

        this.tasks = this.loadState();
        this.draggedTaskEl = null;
        this.pendingDeleteId = null; // Tracks which card is awaiting inline delete confirmation

        this.initTheme();
        this.initEventListeners();
        this.render();
    }

    // ─────────────────────────────────────────
    // DOM CACHING & VALIDATION
    // ─────────────────────────────────────────
    cacheDOM() {
        this.board = {
            todo:       document.getElementById('list-todo'),
            inprogress: document.getElementById('list-inprogress'),
            done:       document.getElementById('list-done')
        };

        this.counters = {
            todo:       document.querySelector('[data-status="todo"] .task-count'),
            inprogress: document.querySelector('[data-status="inprogress"] .task-count'),
            done:       document.querySelector('[data-status="done"] .task-count')
        };

        this.template        = document.getElementById('task-template');
        this.announcer       = document.getElementById('a11y-announcer');
        this.boardContainer  = document.querySelector('.board-container');
        this.themeToggleBtn  = document.getElementById('theme-toggle');
        this.themeIcon       = document.getElementById('theme-icon');
        this.htmlEl          = document.documentElement;
        this.addTaskBtn      = document.getElementById('add-task-btn');
        this.taskModal       = document.getElementById('task-modal');
        this.modalBackdrop   = document.getElementById('modal-backdrop');
        this.closeModalBtn   = document.getElementById('close-modal-btn');
        this.cancelTaskBtn   = document.getElementById('cancel-task-btn');
        this.taskForm        = document.getElementById('task-form');

        return this.template && this.taskModal && this.board.todo;
    }

    // ─────────────────────────────────────────
    // EVENT LISTENERS
    // ─────────────────────────────────────────
    initEventListeners() {
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        this.addTaskBtn.addEventListener('click', () => this.openModal());
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelTaskBtn.addEventListener('click', () => this.closeModal());

        // FIX: Reliable click-outside via dedicated backdrop element (replaces getBoundingClientRect hack)
        this.modalBackdrop.addEventListener('click', () => this.closeModal());

        this.taskForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.boardContainer.addEventListener('click', (e) => this.handleBoardClick(e));

        // HTML5 Drag and Drop — delegated to board container
        this.boardContainer.addEventListener('dragstart',  (e) => this.handleDragStart(e));
        this.boardContainer.addEventListener('dragend',    (e) => this.handleDragEnd(e));
        this.boardContainer.addEventListener('dragover',   (e) => this.handleDragOver(e));
        this.boardContainer.addEventListener('dragenter',  (e) => this.handleDragEnter(e));
        this.boardContainer.addEventListener('dragleave',  (e) => this.handleDragLeave(e));
        this.boardContainer.addEventListener('drop',       (e) => this.handleDrop(e));
    }

    // ─────────────────────────────────────────
    // THEME  (FIX: persisted to localStorage)
    // ─────────────────────────────────────────
    initTheme() {
        // Prefer saved choice; fall back to OS preference
        const saved       = localStorage.getItem('kanban-pro-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.applyTheme(saved || (prefersDark ? 'dark' : 'light'));
    }

    toggleTheme() {
        const current = this.htmlEl.getAttribute('data-theme');
        this.applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    // FIX: Single method owns all theme side-effects
    applyTheme(theme) {
        this.htmlEl.setAttribute('data-theme', theme);
        localStorage.setItem('kanban-pro-theme', theme);
        this.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌗';
        this.themeToggleBtn.setAttribute(
            'aria-label',
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        );
        this.announceToScreenReader(`${theme} mode enabled`);
    }

    // ─────────────────────────────────────────
    // WEB STORAGE (Persistence)
    // ─────────────────────────────────────────
    loadState() {
        try {
            const saved = localStorage.getItem('kanban-pro-tasks');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Failed to parse tasks from localStorage', e);
            return [];
        }
    }

    saveState() {
        localStorage.setItem('kanban-pro-tasks', JSON.stringify(this.tasks));
    }

    // ─────────────────────────────────────────
    // STATE MANAGEMENT
    // ─────────────────────────────────────────
    generateId() {
        return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    addTask(title, description, priority, status = 'todo') {
        const newTask = {
            id: this.generateId(),
            title,
            description,
            priority,
            status,
            // FIX: field renamed from 'timestamp' to 'createdAt' for clarity
            createdAt: new Date().toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
        };

        this.tasks.push(newTask);
        this.saveState();
        this.render();
        this.announceToScreenReader(`Task "${newTask.title}" added to To Do.`);
    }

    deleteTask(taskId) {
        const idx = this.tasks.findIndex(t => t.id === taskId);
        if (idx > -1) {
            const title = this.tasks[idx].title;
            this.tasks.splice(idx, 1);
            this.pendingDeleteId = null;
            this.saveState();
            this.render();
            this.announceToScreenReader(`Task "${title}" deleted.`);
        }
    }

    // ─────────────────────────────────────────
    // ASYNC CLOUD SYNC
    // FIX: guard against duplicate indicators; styles via CSS class
    // ─────────────────────────────────────────
    async syncTaskUpdate(taskId, newStatus) {
        // Remove any existing indicator before creating a new one
        document.getElementById('cloud-sync-indicator')?.remove();

        const indicator = document.createElement('div');
        indicator.id = 'cloud-sync-indicator';
        indicator.innerHTML = `<span>☁️ Syncing to cloud...</span>`;
        document.body.appendChild(indicator);

        return new Promise((resolve) => {
            setTimeout(() => {
                indicator.classList.add('synced');
                indicator.innerHTML = `<span>✅ Synced successfully</span>`;

                setTimeout(() => {
                    indicator.remove();
                    resolve();
                }, 1000);
            }, 800);
        });
    }

    // ─────────────────────────────────────────
    // DRAG AND DROP HANDLERS
    // ─────────────────────────────────────────
    handleDragStart(e) {
        const card = e.target.closest('.task-card');
        if (!card) return;

        this.draggedTaskEl = card;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.id);

        // Defer so the drag ghost renders before we fade the original
        setTimeout(() => card.classList.add('is-dragging'), 0);
    }

    handleDragEnd(e) {
        if (!this.draggedTaskEl) return;
        this.draggedTaskEl.classList.remove('is-dragging');
        this.draggedTaskEl = null;
        document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
    }

    handleDragOver(e) {
        e.preventDefault(); // Required to allow drop
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        const col = e.target.closest('.kanban-column');
        if (col && this.draggedTaskEl) col.classList.add('drag-over');
    }

    handleDragLeave(e) {
        const col = e.target.closest('.kanban-column');
        if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    }

    async handleDrop(e) {
        e.preventDefault();
        const col = e.target.closest('.kanban-column');
        if (!col || !this.draggedTaskEl) return;

        col.classList.remove('drag-over');

        const taskId   = e.dataTransfer.getData('text/plain');
        const newStatus = col.dataset.status;
        const task     = this.tasks.find(t => t.id === taskId);

        if (task && task.status !== newStatus) {
            const oldStatus = task.status;
            task.status = newStatus;

            // FIX: persist immediately after optimistic update — not after the async sync
            // Prevents data loss if the user closes the tab during the 800ms network wait
            this.saveState();
            this.render();

            await this.syncTaskUpdate(taskId, newStatus);
            this.announceToScreenReader(`Task moved from ${oldStatus} to ${newStatus}`);
        }
    }

    // ─────────────────────────────────────────
    // MODAL HANDLERS
    // ─────────────────────────────────────────
    openModal() {
        this.taskForm.reset();
        this.pendingDeleteId = null;
        this.taskModal.showModal();
        // FIX: auto-focus the title field so keyboard users can start typing immediately
        document.getElementById('task-title').focus();
        this.announceToScreenReader('New task modal opened');
    }

    closeModal() {
        this.taskModal.close();
        this.addTaskBtn.focus();
        this.announceToScreenReader('New task modal closed');
    }

    handleFormSubmit(e) {
        e.preventDefault();
        const titleInput  = document.getElementById('task-title');
        const title       = titleInput.value.trim();
        const description = document.getElementById('task-desc').value.trim();
        const priority    = document.getElementById('task-priority').value;

        if (!title) {
            titleInput.focus();
            this.announceToScreenReader('Error: Task title cannot be empty');
            return;
        }

        this.addTask(title, description, priority);
        this.closeModal();
    }

    // FIX: Inline "Delete? ✓ ✕" confirmation replaces blocking confirm()
    handleBoardClick(e) {
        const confirmBtn = e.target.closest('.confirm-delete');
        const cancelBtn  = e.target.closest('.cancel-delete');
        const deleteBtn  = e.target.closest('.delete-task');

        if (cancelBtn) {
            this.pendingDeleteId = null;
            this.render();
            return;
        }

        if (confirmBtn) {
            const taskId = confirmBtn.closest('.task-card')?.dataset?.id;
            if (taskId) this.deleteTask(taskId);
            return;
        }

        if (deleteBtn) {
            const card   = deleteBtn.closest('.task-card');
            const taskId = card?.dataset?.id;
            if (!taskId) return;

            this.pendingDeleteId = taskId;
            this.render();

            // Focus the confirm button after the DOM rebuilds
            requestAnimationFrame(() => {
                document.querySelector(`[data-id="${taskId}"] .confirm-delete`)?.focus();
            });
        }
    }

    // ─────────────────────────────────────────
    // RENDERING
    // FIX: saves & restores keyboard focus across full re-renders
    // ─────────────────────────────────────────
    render() {
        // Snapshot focused task ID before wiping the DOM
        const focusedTaskId = document.activeElement?.closest('.task-card')?.dataset?.id;

        Object.values(this.board).forEach(col => col.innerHTML = '');
        const counts = { todo: 0, inprogress: 0, done: 0 };

        this.tasks.forEach(task => {
            const target = this.board[task.status] || this.board.todo;
            target.appendChild(this.createTaskElement(task));
            counts[task.status] = (counts[task.status] || 0) + 1;
        });

        Object.entries(counts).forEach(([status, count]) => {
            if (this.counters[status]) {
                this.counters[status].textContent = count;
                const label = status === 'inprogress' ? 'In Progress'
                            : status === 'todo'       ? 'To Do'
                            : 'Done';
                this.counters[status].setAttribute('aria-label', `${count} tasks in ${label}`);
            }
        });

        // FIX: Restore focus to the same card after re-render so keyboard nav isn't disrupted
        if (focusedTaskId) {
            const restored = document.querySelector(`[data-id="${focusedTaskId}"]`);
            restored?.focus({ preventScroll: true });
        }
    }

    createTaskElement(task) {
        const fragment = this.template.content.cloneNode(true);
        const card     = fragment.querySelector('.task-card');

        card.id         = task.id;
        card.dataset.id = task.id;

        card.querySelector('.task-title').textContent       = task.title;
        card.querySelector('.task-description').textContent = task.description;

        // FIX: support both new 'createdAt' and old 'timestamp' field for backward compat
        card.querySelector('.task-timestamp').textContent = task.createdAt || task.timestamp || '';

        const badge = card.querySelector('.task-priority-badge');
        if (badge) {
            badge.classList.add(`priority-${task.priority}`);
            badge.setAttribute('aria-label', `Priority: ${task.priority}`);
        }

        // FIX: Replace blocking confirm() with inline confirmation buttons
        if (this.pendingDeleteId === task.id) {
            card.querySelector('.task-actions').innerHTML = `
                <span style="font-size:0.75rem; color:var(--danger); white-space:nowrap;">Delete?</span>
                <button class="btn-icon confirm-delete" aria-label="Confirm delete" title="Confirm delete"
                    style="opacity:1; color:var(--danger);">✓</button>
                <button class="btn-icon cancel-delete" aria-label="Cancel delete" title="Cancel"
                    style="opacity:1;">✕</button>
            `;
        }

        return fragment;
    }

    // ─────────────────────────────────────────
    // ACCESSIBILITY
    // ─────────────────────────────────────────
    announceToScreenReader(message) {
        if (!this.announcer) return;
        this.announcer.textContent = message;
        setTimeout(() => this.announcer.textContent = '', 3000);
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    new KanbanApp();
});
