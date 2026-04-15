
// DOM Elements
let sidebar;
let sidebarOverlay;
let mainContent;
let toggleBtn;
let fileList;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    sidebar = document.getElementById('sidebar');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    mainContent = document.getElementById('main-content');
    toggleBtn = document.getElementById('sidebar-toggle');
    fileList = document.getElementById('file-list');

    // Initialize toggle button state if needed
    // In our new design, the toggle button might be part of the sidebar,
    // so we ensure we catch the click correctly.
    const sidebarToggleBtn = document.querySelector('.sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
});

// Toggle Sidebar
export function toggleSidebar() {
    // If elements aren't initialized (compiled HTML issues sometimes), re-fetch
    if (!sidebar) sidebar = document.getElementById('sidebar');
    if (!sidebarOverlay) sidebarOverlay = document.getElementById('sidebar-overlay');
    if (!mainContent) mainContent = document.getElementById('main-content');

    // Toggle 'expanded' class instead of 'open' for the new rail style
    sidebar.classList.toggle('expanded');

    // Update main content margin
    if (mainContent) {
        mainContent.classList.toggle('sidebar-expanded');
    }

    // Handle overlay if we decide to keep it for mobile
    // validation for mobile vs desktop could be added here
    if (window.innerWidth <= 768) {
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('active');
        }
    }
}

// Add file to sidebar list
export function addFileToSidebar(filename, isActive = false) {
    if (!fileList) fileList = document.getElementById('file-list');

    const emptyMsg = fileList.querySelector('.empty-list');
    if (emptyMsg) {
        emptyMsg.remove();
    }

    // Check if file already exists
    const existingFile = fileList.querySelector(`[data-filename="${filename}"]`);
    if (existingFile) {
        // Update active state
        fileList.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
        existingFile.classList.add('active');
        return;
    }

    const fileItem = document.createElement('div');
    fileItem.className = 'file-item' + (isActive ? ' active' : '');
    fileItem.setAttribute('data-filename', filename);
    fileItem.title = filename; // Tooltip for collapsed state

    fileItem.innerHTML = `
        <div class="file-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
        </div>
        <span class="file-name">${filename}</span>
        <button class="file-menu-btn" onclick="event.stopPropagation(); window.showFileMenu(this, '${filename}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"></circle>
                <circle cx="12" cy="12" r="2"></circle>
                <circle cx="12" cy="19" r="2"></circle>
            </svg>
        </button>
    `;

    fileItem.addEventListener('click', () => {
        fileList.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
        fileItem.classList.add('active');

        // Load the file data if htmx is available
        if (typeof htmx !== 'undefined') {
            htmx.ajax('GET', '/data/' + filename, { target: '#data-container', swap: 'innerHTML' });
        }
    });

    fileList.appendChild(fileItem);
}

// Make globally available for inline onclick handlers if necessary
window.toggleSidebar = toggleSidebar;
window.addFileToSidebar = addFileToSidebar;

window.showFileMenu = function (btn, filename) {
    // Simple remove file function for now
    if (confirm('確定要從列表中移除此檔案嗎？')) {
        const item = btn.closest('.file-item');
        if (item) item.remove();

        const fileList = document.getElementById('file-list');
        if (fileList && fileList.children.length === 0) {
            fileList.innerHTML = '<div class="empty-list">尚無上傳的檔案</div>';
        }
    }
}
