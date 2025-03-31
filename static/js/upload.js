document.addEventListener('DOMContentLoaded', function() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const fileName = document.getElementById('file-name');
    const uploadButton = document.getElementById('upload-button');
    const uploadForm = document.getElementById('upload-form');
    const dataContainer = document.getElementById('data-container');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressInfo = document.getElementById('progress-info');
    
    // 初始化禁用上傳按鈕
    uploadButton.disabled = true;
    
    // 處理通過 input 選擇文件
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        handleFile(file);
    });
    
    // 處理拖放事件
    dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });
    
    dropzone.addEventListener('dragleave', function() {
        dropzone.classList.remove('drag-over');
    });
    
    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        fileInput.files = e.dataTransfer.files;
        handleFile(file);
    });
    
    // 處理選擇的或拖放的文件
    function handleFile(file) {
        if (file) {
            // 檢查文件是否為 Excel 文件
            const validExtensions = ['.xlsx', '.xls'];
            const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            
            if (validExtensions.includes(fileExtension)) {
                fileName.textContent = file.name;
                uploadButton.disabled = false;
                clearError();
            } else {
                showError('Invalid file format. Please select an Excel file (.xlsx, .xls).');
                fileInput.value = '';
                fileName.textContent = '';
                uploadButton.disabled = true;
            }
        } else {
            fileName.textContent = '';
            uploadButton.disabled = true;
        }
    }
    
    // 設置 HTMX 事件來處理上傳進度
    if (typeof htmx !== 'undefined') {
        htmx.on('htmx:xhr:loadstart', function(evt) {
            if (evt.detail.elt.id === 'upload-form') {
                // 顯示進度條
                progressContainer.style.display = 'block';
                progressInfo.style.display = 'block';
                progressBar.style.width = '0%';
                progressInfo.textContent = 'Uploading: 0%';
                uploadButton.disabled = true;
            }
        });
        
        htmx.on('htmx:xhr:progress', function(evt) {
            if (evt.detail.elt.id === 'upload-form') {
                // 更新上傳進度
                if (evt.detail.xhr.upload) {
                    const percentComplete = Math.round((evt.detail.loaded / evt.detail.total) * 100);
                    progressBar.style.width = percentComplete + '%';
                    progressInfo.textContent = `Uploading: ${percentComplete}%`;
                }
            }
        });
        
        htmx.on('htmx:xhr:loadend', function(evt) {
            if (evt.detail.elt.id === 'upload-form') {
                // 上傳完成後重置進度條
                setTimeout(function() {
                    progressContainer.style.display = 'none';
                    progressInfo.style.display = 'none';
                    uploadButton.disabled = false;
                }, 1000);
            }
        });
    }
    
    // 處理表單提交
    uploadForm.addEventListener('submit', function(e) {
        if (fileInput.files.length === 0) {
            e.preventDefault();
            showError('Please select a file first.');
            return;
        }
        
        // 顯示載入狀態
        dataContainer.innerHTML = '<div class="loading"></div>';
    });
    
    // 用於顯示錯誤消息的輔助函數
    function showError(message) {
        // 移除任何現有的錯誤消息
        clearError();
        
        // 創建並附加錯誤消息
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        uploadForm.appendChild(errorElement);
    }
    
    // 用於清除錯誤消息的輔助函數
    function clearError() {
        const errorElement = uploadForm.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }
});

// 全局變量用於跟踪當前選擇
let selectedElement = null;
let selectedType = null; // 'row' 或 'column'

// 處理表格及其功能的設置
document.addEventListener('htmx:afterSwap', function(event) {
    console.log("htmx:afterSwap event fired");
    if (event.detail.target.id === 'data-container') {
        const table = document.querySelector('.spreadsheet-table table');
        if (table) {
            console.log("Found table, setting up features");
            
            // 確保表格足夠寬以顯示所有數據
            const container = document.querySelector('.spreadsheet-container');
            const minTableWidth = Math.max(table.offsetWidth, container.offsetWidth + 200);
            
            // 強制表格寬度超過容器以顯示水平滾動條
            if (table.offsetWidth <= container.offsetWidth) {
                table.style.minWidth = minTableWidth + 'px';
            }
            
            // 確保容器能夠水平滾動
            container.scrollLeft = 0;
            
            // 創建右鍵選單（如果不存在）
            createContextMenu();
            
            // 設置可編輯單元格
            setupEditableCells();
            
            // 設置列和行選擇
            setupSelectionHandlers();
            
            // 設置右鍵選單和刪除功能
            setupContextMenu();
        }
    }
});

// 設置可編輯單元格
function setupEditableCells() {
    console.log("Setting up editable cells");
    const tableCells = document.querySelectorAll('.spreadsheet-table td:not(.row-header)');
    
    tableCells.forEach(cell => {
        // 移除現有事件以防止重複
        cell.removeEventListener('dblclick', cellDblClickHandler);
        
        // 雙擊開始編輯
        cell.addEventListener('dblclick', cellDblClickHandler);
    });
    
    // 點擊表格外的區域結束編輯
    document.addEventListener('click', documentClickHandler);
    
    // 處理鍵盤事件
    document.addEventListener('keydown', documentKeydownHandler);
}

// 單元格雙擊處理函數
function cellDblClickHandler(e) {
    console.log("Cell double-clicked");
    startEditing(this);
}

// 文檔點擊處理函數
function documentClickHandler(e) {
    const activeCell = document.querySelector('.spreadsheet-table td.editing');
    if (activeCell && !activeCell.contains(e.target) && e.target.className !== 'cell-editor') {
        finishEditing(activeCell);
    }
}

// 文檔鍵盤事件處理函數
function documentKeydownHandler(e) {
    const activeCell = document.querySelector('.spreadsheet-table td.editing');
    
    // 處理編輯中的單元格鍵盤事件
    if (activeCell) {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEditing(activeCell);
            return;
        }
        
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditing(activeCell);
            return;
        }
    }
    // 處理刪除鍵
    else if (e.key === 'Delete' && selectedElement && !document.querySelector('.spreadsheet-table td.editing')) {
        console.log("Delete key pressed for selection", selectedType);
        e.preventDefault();
        if (selectedType === 'row') {
            const rowIndex = parseInt(selectedElement.getAttribute('data-row'));
            deleteRow(rowIndex);
        } else if (selectedType === 'column') {
            const colIndex = parseInt(selectedElement.getAttribute('data-col'));
            deleteColumn(colIndex);
        }
    }
}

// 開始編輯單元格
function startEditing(cell) {
    console.log("Starting edit mode for cell");
    // 如果有其他單元格在編輯中，先結束編輯
    const activeCell = document.querySelector('.spreadsheet-table td.editing');
    if (activeCell && activeCell !== cell) {
        finishEditing(activeCell);
    }
    
    // 如果單元格已經在編輯，則不處理
    if (cell.classList.contains('editing')) {
        return;
    }
    
    // 儲存原始內容，以便取消編輯時使用
    cell.dataset.originalContent = cell.textContent;
    
    // 創建輸入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-editor';
    input.value = cell.textContent;
    
    // 清空單元格並添加輸入框
    cell.textContent = '';
    cell.classList.add('editing');
    cell.appendChild(input);
    
    // 聚焦輸入框並選擇所有文字
    input.focus();
    input.select();
    
    // 防止點擊輸入框時觸發文檔點擊事件
    input.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // 防止輸入框內的鍵盤事件冒泡到文檔
    input.addEventListener('keydown', function(e) {
        e.stopPropagation();
        
        // 在輸入框內按下 Enter 處理
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEditing(cell);
        }
        
        // 在輸入框內按下 Escape 處理
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditing(cell);
        }
    });
}

// 完成編輯
function finishEditing(cell) {
    console.log("Finishing edit mode");
    const input = cell.querySelector('.cell-editor');
    if (input) {
        const newValue = input.value;
        const oldValue = cell.dataset.originalContent;
        
        // 更新單元格內容
        cell.textContent = newValue;
        cell.classList.remove('editing');
        
        // 如果值已更改，則發送到服務器
        if (newValue !== oldValue) {
            // 獲取當前顯示的文件名和單元格位置
            const sheetTitle = document.querySelector('.sheet-title h2');
            let filename = '';
            if (sheetTitle) {
                const titleText = sheetTitle.textContent;
                filename = titleText.split(' - ')[0].trim();
            }
            
            const rowIndex = cell.parentElement.rowIndex - 1; // 減 1 是因為表頭行
            const colIndex = cell.cellIndex - 1; // 減 1 是因為行標題列
            
            console.log("Sending edit to server", filename, rowIndex, colIndex, newValue);
            
            // 發送編輯數據到服務器
            fetch('/api/edit-cell', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: filename,
                    row: rowIndex,
                    col: colIndex,
                    value: newValue
                })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    console.error('Failed to save cell edit:', data.error);
                }
            })
            .catch(error => {
                console.error('Error saving cell edit:', error);
            });
        }
    }
}

// 取消編輯
function cancelEditing(cell) {
    console.log("Cancelling edit mode");
    if (cell.classList.contains('editing')) {
        // 還原原始內容
        cell.textContent = cell.dataset.originalContent || '';
        cell.classList.remove('editing');
    }
}

// 設置列和行選擇
function setupSelectionHandlers() {
    console.log("Setting up selection handlers");
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;
    
    // 清除先前的選擇
    clearSelection();
    
    // 設置列標題點擊事件
    const columnHeaders = table.querySelectorAll('th.column-header');
    columnHeaders.forEach(header => {
        // 移除現有事件以防止重複
        header.removeEventListener('click', columnHeaderClickHandler);
        
        // 添加新的事件處理程序
        header.addEventListener('click', columnHeaderClickHandler);
    });
    
    // 設置行標題點擊事件
    const rowHeaders = table.querySelectorAll('td.row-header');
    rowHeaders.forEach(header => {
        // 移除現有事件以防止重複
        header.removeEventListener('click', rowHeaderClickHandler);
        
        // 添加新的事件處理程序
        header.addEventListener('click', rowHeaderClickHandler);
    });
}

// 列標題點擊處理函數
function columnHeaderClickHandler(e) {
    console.log("Column header clicked");
    // 清除先前的選擇
    clearSelection();
    
    // 獲取列索引
    const colIndex = parseInt(this.getAttribute('data-col'));
    
    // 選擇整列
    selectColumn(colIndex);
    
    // 記錄當前選擇
    selectedElement = this;
    selectedType = 'column';
}

// 行標題點擊處理函數
function rowHeaderClickHandler(e) {
    console.log("Row header clicked");
    // 清除先前的選擇
    clearSelection();
    
    // 獲取行索引
    const rowIndex = parseInt(this.getAttribute('data-row'));
    
    // 選擇整行
    selectRow(rowIndex);
    
    // 記錄當前選擇
    selectedElement = this;
    selectedType = 'row';
}

// 設置右鍵選單和刪除功能
function setupContextMenu() {
    console.log("Setting up context menu");
    const table = document.querySelector('.spreadsheet-table table');
    const contextMenu = document.getElementById('context-menu');
    const deleteMenuItem = document.getElementById('delete-menu-item');
    
    if (!table || !contextMenu || !deleteMenuItem) {
        console.error("Missing elements for context menu setup", {
            table: !!table,
            contextMenu: !!contextMenu,
            deleteMenuItem: !!deleteMenuItem
        });
        
        // 如果找不到選單，可能需要創建它
        if (!contextMenu) {
            createContextMenu();
        }
        return;
    }
    
    // 清除現有事件處理程序
    deleteMenuItem.removeEventListener('click', deleteMenuItemClickHandler);
    deleteMenuItem.addEventListener('click', deleteMenuItemClickHandler);
    
    // 為列標題和行標題設置右鍵選單
    const headers = table.querySelectorAll('th.column-header, td.row-header');
    console.log(`Found ${headers.length} headers to attach context menu`);
    
    headers.forEach(header => {
        // 移除現有事件以防止重複
        header.removeEventListener('contextmenu', headerContextMenuHandler);
        
        // 添加新的事件處理程序
        header.addEventListener('contextmenu', headerContextMenuHandler);
    });
    
    // 點擊其他區域時隱藏選單
    document.addEventListener('click', function(e) {
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
    
    // 防止選單內點擊冒泡到文檔
    contextMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

// 創建右鍵選單（如果不存在）
function createContextMenu() {
    console.log("Creating context menu");
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) return;
    
    const contextMenu = document.createElement('div');
    contextMenu.id = 'context-menu';
    contextMenu.className = 'context-menu';
    
    const deleteMenuItem = document.createElement('div');
    deleteMenuItem.id = 'delete-menu-item';
    deleteMenuItem.className = 'context-menu-item delete';
    deleteMenuItem.textContent = '刪除';
    deleteMenuItem.addEventListener('click', deleteMenuItemClickHandler);
    
    contextMenu.appendChild(deleteMenuItem);
    document.body.appendChild(contextMenu);
    
    console.log("Context menu created and added to document");
}

// 全局變量，用於跟踪右鍵選單的目標元素
let contextMenuTarget = null;

// 標題右鍵選單處理函數
function headerContextMenuHandler(e) {
    console.log("Context menu triggered on header");
    e.preventDefault();
    
    // 獲取上下文選單元素
    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu) {
        console.error("Context menu element not found");
        return;
    }
    
    // 保存目標元素
    contextMenuTarget = this;
    
    // 確保選單可見
    contextMenu.style.display = 'block';
    
    // 根據滑鼠位置定位選單
    setTimeout(() => {
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        console.log(`Context menu positioned at ${e.pageX}px, ${e.pageY}px`);
    }, 0);
    
    // 清除現有選擇
    clearSelection();
    
    // 如果是列標題，選擇整列
    if (this.classList.contains('column-header')) {
        const colIndex = parseInt(this.getAttribute('data-col'));
        selectColumn(colIndex);
        selectedElement = this;
        selectedType = 'column';
    } 
    // 如果是行標題，選擇整行
    else if (this.classList.contains('row-header')) {
        const rowIndex = parseInt(this.getAttribute('data-row'));
        selectRow(rowIndex);
        selectedElement = this;
        selectedType = 'row';
    }
}

// 刪除選單項點擊處理函數
function deleteMenuItemClickHandler() {
    console.log("Delete menu item clicked");
    if (contextMenuTarget) {
        // 如果是列標題
        if (contextMenuTarget.classList.contains('column-header')) {
            const colIndex = parseInt(contextMenuTarget.getAttribute('data-col'));
            deleteColumn(colIndex);
        } 
        // 如果是行標題
        else if (contextMenuTarget.classList.contains('row-header')) {
            const rowIndex = parseInt(contextMenuTarget.getAttribute('data-row'));
            deleteRow(rowIndex);
        }
        
        // 隱藏選單
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
        
        // 重置目標
        contextMenuTarget = null;
    }
}

// 清除選擇
function clearSelection() {
    console.log("Clearing selection");
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;
    
    // 清除列選擇
    table.querySelectorAll('.selected-column').forEach(cell => {
        cell.classList.remove('selected-column');
    });
    
    // 清除行選擇
    table.querySelectorAll('.selected-row').forEach(row => {
        row.classList.remove('selected-row');
    });
    
    // 清除單元格選擇
    table.querySelectorAll('.selected').forEach(cell => {
        cell.classList.remove('selected');
    });
    
    // 重置選擇追踪
    selectedElement = null;
    selectedType = null;
}

// 選擇整列
function selectColumn(colIndex) {
    console.log("Selecting column", colIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;
    
    // 選擇標題
    const header = table.querySelector(`th.column-header[data-col="${colIndex}"]`);
    if (header) {
        header.classList.add('selected');
    }
    
    // 選擇所有單元格
    const cells = table.querySelectorAll(`td[data-col="${colIndex}"]`);
    cells.forEach(cell => {
        cell.classList.add('selected-column');
    });
}

// 選擇整行
function selectRow(rowIndex) {
    console.log("Selecting row", rowIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;
    
    // 選擇行標題
    const header = table.querySelector(`td.row-header[data-row="${rowIndex}"]`);
    if (header) {
        header.classList.add('selected');
    }
    
    // 選擇整行
    const row = table.querySelector(`tr[data-row="${rowIndex}"]`);
    if (row) {
        row.classList.add('selected-row');
    }
}

// 刪除行
function deleteRow(rowIndex) {
    console.log("Deleting row", rowIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;
    
    // 獲取當前顯示的文件名
    const sheetTitle = document.querySelector('.sheet-title h2');
    let filename = '';
    if (sheetTitle) {
        const titleText = sheetTitle.textContent;
        filename = titleText.split(' - ')[0].trim();
    }
    
    // 從表格中移除行
    const row = table.querySelector(`tr[data-row="${rowIndex}"]`);
    if (row) {
        row.remove();
        
        // 更新後續行的索引
        const rows = table.querySelectorAll('tr[data-row]');
        rows.forEach(r => {
            const currentIndex = parseInt(r.getAttribute('data-row'));
            if (currentIndex > rowIndex) {
                const newIndex = currentIndex - 1;
                r.setAttribute('data-row', newIndex);
                
                // 更新行內所有單元格
                const cells = r.querySelectorAll('td');
                cells.forEach(cell => {
                    cell.setAttribute('data-row', newIndex);
                });
                
                // 更新行號
                const rowHeader = r.querySelector('.row-header');
                if (rowHeader) {
                    rowHeader.textContent = newIndex + 1;
                }
            }
        });
        
        // 發送刪除請求到服務器
        fetch('/api/delete-row', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: filename,
                row: rowIndex
            })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Failed to delete row:', data.error);
            }
        })
        .catch(error => {
            console.error('Error deleting row:', error);
        });
    }
    
    // 清除選擇
    clearSelection();
}

// 刪除列
function deleteColumn(colIndex) {
    console.log("Deleting column", colIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;
    
    // 獲取當前顯示的文件名
    const sheetTitle = document.querySelector('.sheet-title h2');
    let filename = '';
    if (sheetTitle) {
        const titleText = sheetTitle.textContent;
        filename = titleText.split(' - ')[0].trim();
    }
    
    // 從表格中移除列標題
    const header = table.querySelector(`th.column-header[data-col="${colIndex}"]`);
    if (header) {
        header.remove();
    }
    
    // 從每行中移除相應的單元格
    const cells = table.querySelectorAll(`td[data-col="${colIndex}"]`);
    cells.forEach(cell => {
        cell.remove();
    });
    
    // 更新後續列的索引
    // 更新標題
    const headers = table.querySelectorAll('th.column-header');
    headers.forEach(h => {
        const currentIndex = parseInt(h.getAttribute('data-col'));
        if (currentIndex > colIndex) {
            const newIndex = currentIndex - 1;
            h.setAttribute('data-col', newIndex);
            h.textContent = columnToLetter(newIndex);
        }
    });
    
    // 更新單元格
    const remainingCells = table.querySelectorAll('td[data-col]');
    remainingCells.forEach(cell => {
        const currentIndex = parseInt(cell.getAttribute('data-col'));
        if (currentIndex > colIndex) {
            cell.setAttribute('data-col', currentIndex - 1);
        }
    });
    
    // 發送刪除請求到服務器
    fetch('/api/delete-column', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            filename: filename,
            column: colIndex
        })
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to delete column:', data.error);
        }
    })
    .catch(error => {
        console.error('Error deleting column:', error);
    });
    
    // 清除選擇
    clearSelection();
}

// 將列索引轉換為字母標籤 (A, B, C, ..., Z, AA, AB, ...)
function columnToLetter(i) {
    let result = '';
    i = parseInt(i);
    
    do {
        const mod = i % 26;
        result = String.fromCharCode(65 + mod) + result;
        i = Math.floor(i / 26) - 1;
    } while (i >= 0);
    
    return result;
}