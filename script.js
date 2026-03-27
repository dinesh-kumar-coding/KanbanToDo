/**
 * =========================================
 * KANBAN PRO - CORE APPLICATION
 * Final Build: State, Events, A11y, Storage & Async Drag-and-Drop
 * =========================================
 */

class KanbanApp {
    constructor() {
        // --- 1. Boot up sequence & DOM Caching ---
        if (!this.cacheDOM()) {
            console.error('KanbanApp Initialization Failed: Missing critical DOM elements.');
            return; 
        }
        
        // --- 2. State Initialization (Web Storage API) ---
        this.tasks = this.loadState(); 
        this.draggedTaskEl = null; // Reference to the currently dragged DOM element
        
        // --- 3. Run Systems ---
        this.initTheme();
        this.initEventListeners();
        this.render();
    }

    /**
     * --- DOM CACHING & VALIDATION ---
     */
    cacheDOM() {
        this.board = {
            todo: document.getElementById('list-todo'),
            inprogress: document.getElementById('list-inprogress'),
            done: document.getElementById('list-done')
        };
        
        this.counters = {
            todo: document.querySelector('[data-status="todo"] .task-count'),
            inprogress: document.querySelector('[data-status="inprogress"] .task-count'),
            done: document.querySelector('[data-status="done"] .task-count')
        };
        
        this.template = document.getElementById('task-template');
        this.announcer = document.getElementById('a11y-announcer');
        this.boardContainer = document.querySelector('.board-container');
        
        this.themeToggleBtn = document.getElementById('theme-toggle');
        this.htmlEl = document.documentElement;

        this.addTaskBtn = document.getElementById('add-task-btn');
        this.taskModal = document.getElementById('task-modal');
        this.closeModalBtn = document.getElementById('close-modal-btn');
        this.cancelTaskBtn = document.getElementById('cancel-task-btn');
        this.taskForm = document.getElementById('task-form');

        return this.template && this.taskModal && this.board.todo;
    }

    /**
     * --- EVENT LISTENERS ---
     */
    initEventListeners() {
        // Theme & Modals
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        this.addTaskBtn.addEventListener('click', () => this.openModal());
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelTaskBtn.addEventListener('click', () => this.closeModal());
        
        this.taskModal.addEventListener('click', (e) => {
            const rect = this.taskModal.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                this.closeModal();
            }
        });

        this.taskForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.boardContainer.addEventListener('click', (e) => this.handleBoardClick(e));

        // HTML5 Drag and Drop API Events (Delegated to Board Container)
        this.boardContainer.addEventListener('dragstart', (e) => this.handleDragStart(e));
        this.boardContainer.addEventListener('dragend', (e) => this.handleDragEnd(e));
        this.boardContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.boardContainer.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        this.boardContainer.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.boardContainer.addEventListener('drop', (e) => this.handleDrop(e));
    }

    /**
     * --- WEB STORAGE API (Persistence) ---
     */
    loadState() {
        try {
            const savedTasks = localStorage.getItem('kanban-pro-tasks');
            return savedTasks ? JSON.parse(savedTasks) : [];
        } catch (error) {
            console.error('Failed to parse tasks from localStorage', error);
            return [];
        }
    }

    saveState() {
        localStorage.setItem('kanban-pro-tasks', JSON.stringify(this.tasks));
    }

    /**
     * --- STATE MANAGEMENT ---
     */
    generateId() {
        return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    addTask(title, description, priority, status = 'todo') {
        const newTask = {
            id: this.generateId(),
            title: title,
            description: description,
            priority: priority,
            status: status,
            timestamp: new Date().toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            })
        };

        this.tasks.push(newTask);
        this.saveState();
        this.render();
        this.announceToScreenReader(`Task "${newTask.title}" added to To Do.`);
    }

    deleteTask(taskId) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex > -1) {
            const taskTitle = this.tasks[taskIndex].title;
            this.tasks.splice(taskIndex, 1);
            this.saveState();
            this.render();
            this.announceToScreenReader(`Task "${taskTitle}" deleted.`);
        }
    }

    /**
     * --- ASYNCHRONOUS CLOUD SIMULATION ---
     */
    async syncTaskUpdate(taskId, newStatus) {
        // 1. Create a dynamic syncing indicator UI
        const syncIndicator = document.createElement('div');
        syncIndicator.id = 'cloud-sync-indicator';
        syncIndicator.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; 
            background-color: var(--accent-primary); color: #fff; 
            padding: 10px 20px; border-radius: 50px; 
            box-shadow: var(--shadow-md); z-index: 1000;
            display: flex; align-items: center; gap: 10px;
            font-size: var(--text-sm); font-weight: 500;
            animation: modalSlideUp 0.3s ease forwards;
        `;
        syncIndicator.innerHTML = `<span>☁️ Syncing to cloud...</span>`;
        document.body.appendChild(syncIndicator);

        // 2. Return a Promise that simulates a network delay
        return new Promise((resolve) => {
            setTimeout(() => {
                syncIndicator.innerHTML = `<span>✅ Synced successfully</span>`;
                syncIndicator.style.backgroundColor = 'var(--priority-low)';
                
                // Remove indicator after success message
                setTimeout(() => {
                    syncIndicator.remove();
                    resolve(); // Resolve the promise
                }, 1000);
            }, 800); // 800ms artificial latency
        });
    }

    /**
     * --- DRAG AND DROP HANDLERS ---
     */
    handleDragStart(e) {
        const taskCard = e.target.closest('.task-card');
        if (!taskCard) return;

        this.draggedTaskEl = taskCard;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskCard.dataset.id);
        
        // Use setTimeout to ensure the visual dragging ghost is generated 
        // before we hide/fade the original element.
        setTimeout(() => taskCard.classList.add('is-dragging'), 0);
    }

    handleDragEnd(e) {
        if (!this.draggedTaskEl) return;
        this.draggedTaskEl.classList.remove('is-dragging');
        this.draggedTaskEl = null;

        // Clean up visual states on all columns
        document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
    }

    handleDragOver(e) {
        // CRITICAL: default must be prevented to allow drop
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        const column = e.target.closest('.kanban-column');
        if (column && this.draggedTaskEl) {
            column.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const column = e.target.closest('.kanban-column');
        // Only remove styling if we are actually leaving the column boundaries
        if (column && !column.contains(e.relatedTarget)) {
            column.classList.remove('drag-over');
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        const column = e.target.closest('.kanban-column');
        
        if (!column || !this.draggedTaskEl) return;
        
        column.classList.remove('drag-over');
        
        const taskId = e.dataTransfer.getData('text/plain');
        const newStatus = column.dataset.status;
        const task = this.tasks.find(t => t.id === taskId);

        // If the task was dropped into a different column
        if (task && task.status !== newStatus) {
            const oldStatus = task.status;
            
            // Optimistically update UI
            task.status = newStatus;
            this.render();
            
            // Wait for our asynchronous cloud sync
            await this.syncTaskUpdate(taskId, newStatus);
            
            // Save to persistent local storage after cloud sync confirms
            this.saveState();
            
            this.announceToScreenReader(`Task moved from ${oldStatus} to ${newStatus}`);
        }
    }

    /**
     * --- STANDARD EVENT HANDLERS & RENDERING ---
     */
    openModal() {
        this.taskForm.reset();
        this.taskModal.showModal();
        this.announceToScreenReader('New task modal opened');
    }

    closeModal() {
        this.taskModal.close();
        this.addTaskBtn.focus(); 
        this.announceToScreenReader('New task modal closed');
    }

    handleFormSubmit(e) {
        e.preventDefault();
        const titleInput = document.getElementById('task-title');
        const title = titleInput.value.trim();
        const description = document.getElementById('task-desc').value.trim();
        const priority = document.getElementById('task-priority').value;

        if (!title) {
            titleInput.focus();
            this.announceToScreenReader('Error: Task title cannot be empty');
            return;
        }

        this.addTask(title, description, priority);
        this.closeModal();
    }

    handleBoardClick(e) {
        const deleteBtn = e.target.closest('.delete-task');
        if (!deleteBtn) return;

        const taskCard = deleteBtn.closest('.task-card');
        const taskId = taskCard?.dataset?.id;
        
        if (taskId && confirm('Are you sure you want to delete this task?')) {
            this.deleteTask(taskId);
        }
    }

    toggleTheme() {
        const currentTheme = this.htmlEl.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.htmlEl.setAttribute('data-theme', newTheme);
        this.announceToScreenReader(`${newTheme} mode enabled`);
    }

    initTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            this.htmlEl.setAttribute('data-theme', 'dark');
        }
    }

    render() {
        Object.values(this.board).forEach(column => column.innerHTML = '');
        const counts = { todo: 0, inprogress: 0, done: 0 };

        this.tasks.forEach(task => {
            const targetList = this.board[task.status] || this.board.todo; 
            targetList.appendChild(this.createTaskElement(task));
            counts[task.status] = (counts[task.status] || 0) + 1;
        });

        Object.entries(counts).forEach(([status, count]) => {
            if (this.counters[status]) {
                this.counters[status].textContent = count;
                const statusName = status === 'inprogress' ? 'In Progress' : status === 'todo' ? 'To Do' : 'Done';
                this.counters[status].setAttribute('aria-label', `${count} tasks in ${statusName}`);
            }
        });
    }

    createTaskElement(task) {
        const fragment = this.template.content.cloneNode(true);
        const card = fragment.querySelector('.task-card');
        
        card.id = task.id;
        card.dataset.id = task.id; 

        card.querySelector('.task-title').textContent = task.title;
        card.querySelector('.task-description').textContent = task.description;
        card.querySelector('.task-timestamp').textContent = task.timestamp;

        const badge = card.querySelector('.task-priority-badge');
        if (badge) {
            badge.classList.add(`priority-${task.priority}`);
            badge.setAttribute('aria-label', `Priority: ${task.priority}`);
        }

        return fragment;
    }

    announceToScreenReader(message) {
        if (!this.announcer) return;
        this.announcer.textContent = message;
        setTimeout(() => this.announcer.textContent = '', 3000);
    }
}

// Bootstrap Application
document.addEventListener('DOMContentLoaded', () => {
    new KanbanApp();
});

