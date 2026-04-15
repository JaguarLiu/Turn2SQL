// event.js - 負責所有事件處理

import {
    selectedElement, selectedType, selectedElements, multiSelectMode, shiftKeyPressed,
    contextMenuTarget, clearSelection, selectColumn, selectRow, toggleColumnSelection,
    toggleRowSelection, deleteRow, deleteColumn, showMultiSelectHint, hideMultiSelectHint
} from './table.js';
import { getCurrentFilename } from './api.js';

// 全域事件監聽器是否已初始化
let _globalListenersInitialized = false;

// 刪除選單事件是否已綁定
let _deleteMenuHandlerBound = false;

// 設置事件監聽器（每次表格更新後呼叫）
export function setupEventListeners(table) {
    console.log("Setting up event listeners");

    // 全域 document 事件只註冊一次
    setupGlobalListeners();

    // 綁定刪除選單事件（context menu 在 body 中持久存在，只需綁定一次）
    bindDeleteMenuHandler();

    // 元素級事件（表格 HTML 被 htmx 替換後重新綁定）
    setupEditableCells(table);
    setupSelectionHandlers(table);
    setupHeaderContextMenus(table);
}

// 全域 document 事件 — 只註冊一次
function setupGlobalListeners() {
    if (_globalListenersInitialized) return;
    _globalListenersInitialized = true;

    console.log("Setting up global listeners (once)");

    // 點擊：結束編輯 + 隱藏右鍵選單
    document.addEventListener('click', function (e) {
        // 結束編輯
        const activeCell = document.querySelector('.spreadsheet-table td.editing');
        if (activeCell && !activeCell.contains(e.target) && e.target.className !== 'cell-editor') {
            finishEditing(activeCell);
        }

        // 隱藏右鍵選單
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    // 鍵盤按下
    document.addEventListener('keydown', function (e) {
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
        // Shift 鍵處理，用於多選
        else if (e.key === 'Shift') {
            shiftKeyPressed = true;
            showMultiSelectHint();
        }
        // 處理刪除鍵
        else if (e.key === 'Delete' && !document.querySelector('.spreadsheet-table td.editing')) {
            e.preventDefault();
            handleDeleteKey();
        }
    });

    // 鍵盤放開
    document.addEventListener('keyup', function (e) {
        if (e.key === 'Shift') {
            shiftKeyPressed = false;
            hideMultiSelectHint();
        }
    });
}

// 處理 Delete 鍵
function handleDeleteKey() {
    console.log("Delete key pressed");

    // 多選模式
    if (multiSelectMode && selectedElements.length > 0) {
        const type = selectedElements[0].type;
        const label = type === 'row' ? '行' : '列';
        if (!confirm(`確定要刪除選取的 ${selectedElements.length} ${label}嗎？`)) return;

        const indices = selectedElements
            .map(item => item.index)
            .sort((a, b) => b - a); // 降序，從後向前刪除

        if (type === 'row') {
            indices.forEach(i => deleteRow(i, true));
        } else if (type === 'column') {
            indices.forEach(i => deleteColumn(i, true));
        }

        selectedElements.length = 0;
        multiSelectMode = false;
    }
    // 單選模式
    else if (selectedElement && !multiSelectMode) {
        if (selectedType === 'row') {
            const rowIndex = parseInt(selectedElement.getAttribute('data-row'));
            deleteRow(rowIndex);
        } else if (selectedType === 'column') {
            const colIndex = parseInt(selectedElement.getAttribute('data-col'));
            deleteColumn(colIndex);
        }
    }
}

// 綁定刪除選單點擊事件（context menu 持久存在於 body，只綁定一次）
function bindDeleteMenuHandler() {
    if (_deleteMenuHandlerBound) return;
    const deleteMenuItem = document.getElementById('delete-menu-item');
    if (!deleteMenuItem) return;
    _deleteMenuHandlerBound = true;

    deleteMenuItem.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteMenuItemClickHandler();
    });

    // 防止選單內點擊冒泡
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.addEventListener('click', function (e) {
            e.stopPropagation();
        });
    }
}

// 設置可編輯單元格（元素級 — 每次表格更新後重新綁定）
function setupEditableCells(table) {
    console.log("Setting up editable cells");
    const tableCells = table.querySelectorAll('td:not(.row-header)');
    tableCells.forEach(cell => {
        cell.addEventListener('dblclick', function () {
            startEditing(this);
        });
    });
}

// 設置列和行選擇（元素級）
function setupSelectionHandlers(table) {
    console.log("Setting up selection handlers");
    clearSelection();

    table.querySelectorAll('th.column-header').forEach(header => {
        header.addEventListener('click', function (e) {
            columnHeaderClickHandler.call(this, e);
        });
    });

    table.querySelectorAll('td.row-header').forEach(header => {
        header.addEventListener('click', function (e) {
            rowHeaderClickHandler.call(this, e);
        });
    });
}

// 設置表頭右鍵選單（元素級）
function setupHeaderContextMenus(table) {
    console.log("Setting up header context menus");
    const headers = table.querySelectorAll('th.column-header, td.row-header');

    headers.forEach(header => {
        header.addEventListener('contextmenu', function (e) {
            headerContextMenuHandler.call(this, e);
        });
    });
}

// 列標題點擊處理函數
function columnHeaderClickHandler(e) {
    const colIndex = parseInt(this.getAttribute('data-col'));

    if (shiftKeyPressed) {
        toggleColumnSelection(colIndex);
    } else {
        clearSelection();
        selectColumn(colIndex);
        selectedElement = this;
        selectedType = 'column';
    }
}

// 行標題點擊處理函數
function rowHeaderClickHandler(e) {
    const rowIndex = parseInt(this.getAttribute('data-row'));

    if (shiftKeyPressed) {
        toggleRowSelection(rowIndex);
    } else {
        clearSelection();
        selectRow(rowIndex);
        selectedElement = this;
        selectedType = 'row';
    }
}

// 標題右鍵選單處理函數
function headerContextMenuHandler(e) {
    e.preventDefault();

    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu) return;

    // 保存目標元素
    contextMenuTarget = this;

    // 顯示選單
    contextMenu.style.display = 'block';
    setTimeout(() => {
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
    }, 0);

    // 如果不是多選模式，清除現有選擇
    if (!multiSelectMode) {
        clearSelection();
    }

    // 選擇對應的行或列
    if (this.classList.contains('column-header')) {
        const colIndex = parseInt(this.getAttribute('data-col'));
        if (!this.classList.contains('multi-selected')) {
            if (multiSelectMode) {
                toggleColumnSelection(colIndex);
            } else {
                selectColumn(colIndex);
                selectedElement = this;
                selectedType = 'column';
            }
        }
    } else if (this.classList.contains('row-header')) {
        const rowIndex = parseInt(this.getAttribute('data-row'));
        if (!this.classList.contains('multi-selected')) {
            if (multiSelectMode) {
                toggleRowSelection(rowIndex);
            } else {
                selectRow(rowIndex);
                selectedElement = this;
                selectedType = 'row';
            }
        }
    }
}

// 刪除選單項點擊處理函數
function deleteMenuItemClickHandler() {
    console.log("Delete menu item clicked");

    // 多選模式
    if (multiSelectMode && selectedElements.length > 0) {
        const type = selectedElements[0].type;
        const label = type === 'row' ? '行' : '列';
        if (!confirm(`確定要刪除選取的 ${selectedElements.length} ${label}嗎？`)) {
            hideContextMenu();
            return;
        }

        const indices = selectedElements
            .map(item => item.index)
            .sort((a, b) => b - a);

        if (type === 'row') {
            indices.forEach(i => deleteRow(i, true));
        } else if (type === 'column') {
            indices.forEach(i => deleteColumn(i, true));
        }

        selectedElements = [];
        multiSelectMode = false;
    }
    // 單選模式（透過右鍵選單）
    else if (contextMenuTarget) {
        if (contextMenuTarget.classList.contains('column-header')) {
            const colIndex = parseInt(contextMenuTarget.getAttribute('data-col'));
            deleteColumn(colIndex);
        } else if (contextMenuTarget.classList.contains('row-header')) {
            const rowIndex = parseInt(contextMenuTarget.getAttribute('data-row'));
            deleteRow(rowIndex);
        }
    }

    hideContextMenu();
    contextMenuTarget = null;
}

// 隱藏右鍵選單
function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

// 開始編輯單元格
function startEditing(cell) {
    // 如果有其他單元格在編輯中，先結束編輯
    const activeCell = document.querySelector('.spreadsheet-table td.editing');
    if (activeCell && activeCell !== cell) {
        finishEditing(activeCell);
    }

    if (cell.classList.contains('editing')) return;

    // 儲存原始內容
    cell.dataset.originalContent = cell.textContent;

    // 創建輸入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-editor';
    input.value = cell.textContent;

    cell.textContent = '';
    cell.classList.add('editing');
    cell.appendChild(input);

    input.focus();
    input.select();

    // 防止事件冒泡到 document
    input.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEditing(cell);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditing(cell);
        }
    });
}

// 完成編輯 - 透過 htmx 發送請求
function finishEditing(cell) {
    const input = cell.querySelector('.cell-editor');
    if (!input) return;

    const newValue = input.value;
    const oldValue = cell.dataset.originalContent;

    cell.textContent = newValue;
    cell.classList.remove('editing');

    // 如果值已更改，透過 htmx 發送到伺服器
    if (newValue !== oldValue) {
        const filename = getCurrentFilename();
        const rowIndex = cell.parentElement.rowIndex - 1;
        const colIndex = cell.cellIndex - 1;

        htmx.ajax('POST', '/api/edit-cell', {
            target: '#data-container',
            swap: 'innerHTML',
            values: {
                filename: filename,
                row: rowIndex,
                col: colIndex,
                value: newValue
            }
        });
    }
}

// 取消編輯
function cancelEditing(cell) {
    if (cell.classList.contains('editing')) {
        cell.textContent = cell.dataset.originalContent || '';
        cell.classList.remove('editing');
    }
}

// 初始化上傳相關事件
export function setupUploadEvents() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const fileName = document.getElementById('file-name');
    const uploadButton = document.getElementById('upload-button');
    const uploadForm = document.getElementById('upload-form');
    const dataContainer = document.getElementById('data-container');
    const progressBar = document.getElementById('progress-bar');
    const progressInfo = document.getElementById('progress-info');

    // 註冊全域事件（Shift 鍵等）
    setupGlobalListeners();

    // 初始化禁用上傳按鈕
    if (uploadButton) {
        uploadButton.disabled = true;
    }

    // 處理通過 input 選擇文件
    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            handleFile(file, fileName, uploadButton);
        });
    }

    // 處理拖放事件
    if (dropzone) {
        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', function () {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (fileInput) {
                fileInput.files = e.dataTransfer.files;
            }
            handleFile(file, fileName, uploadButton);
        });
    }

    // 上傳進度百分比更新（顯示/隱藏由 hx-indicator 自動處理，按鈕由 hx-disabled-elt 處理）
    if (typeof htmx !== 'undefined') {
        htmx.on('htmx:xhr:loadstart', function (evt) {
            if (evt.detail.elt.id === 'upload-form') {
                if (progressBar && progressInfo) {
                    progressBar.style.width = '0%';
                    progressInfo.textContent = 'Uploading: 0%';
                }
            }
        });

        htmx.on('htmx:xhr:progress', function (evt) {
            if (evt.detail.elt.id === 'upload-form') {
                if (evt.detail.xhr && evt.detail.xhr.upload && progressBar && progressInfo) {
                    const percentComplete = Math.round((evt.detail.loaded / evt.detail.total) * 100);
                    progressBar.style.width = percentComplete + '%';
                    progressInfo.textContent = `Uploading: ${percentComplete}%`;
                }
            }
        });
    }

    // 處理表單提交
    if (uploadForm && dataContainer) {
        uploadForm.addEventListener('submit', function (e) {
            if (fileInput && fileInput.files.length === 0) {
                e.preventDefault();
                showError('Please select a file first.', uploadForm);
                return;
            }
            dataContainer.innerHTML = '<div class="loading"></div>';
        });
    }
}

// 處理選擇的或拖放的文件
function handleFile(file, fileNameElement, uploadButtonElement) {
    if (file) {
        const validExtensions = ['.xlsx', '.xls'];
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

        if (validExtensions.includes(fileExtension)) {
            if (fileNameElement) fileNameElement.textContent = file.name;
            if (uploadButtonElement) uploadButtonElement.disabled = false;
            clearError(document.getElementById('upload-form'));
        } else {
            if (uploadButtonElement) uploadButtonElement.disabled = true;
            const uploadForm = document.getElementById('upload-form');
            if (uploadForm) {
                showError('Invalid file format. Please select an Excel file (.xlsx, .xls).', uploadForm);
                if (fileNameElement) fileNameElement.textContent = '';
            }
            const fileInput = document.getElementById('file-input');
            if (fileInput) fileInput.value = '';
        }
    } else {
        if (fileNameElement) fileNameElement.textContent = '';
        if (uploadButtonElement) uploadButtonElement.disabled = true;
    }
}

// 顯示錯誤消息
function showError(message, formElement) {
    if (!formElement) return;
    clearError(formElement);

    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    formElement.appendChild(errorElement);
}

// 清除錯誤消息
function clearError(formElement) {
    if (!formElement) return;
    const errorElement = formElement.querySelector('.error-message');
    if (errorElement) errorElement.remove();
}
