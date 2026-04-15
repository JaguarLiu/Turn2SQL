// table.js - 負責表格初始化和核心功能

import { getCurrentFilename } from './api.js';

// 全局變量用於跟踪當前選擇
export let selectedElement = null;
export let selectedType = null; // 'row' 或 'column'
export let selectedElements = []; // 多選元素數組
export let multiSelectMode = false; // 多選模式標誌
export let shiftKeyPressed = false; // Shift 鍵狀態
export let contextMenuTarget = null; // 右鍵選單目標元素

/**
 * 初始化表格功能
 * @param {HTMLElement} container - 表格容器元素
 * @returns {HTMLElement|null} - 表格元素
 */
export function initializeTable(container) {
    console.log("Initializing table");
    const table = container.querySelector('.spreadsheet-table table');
    if (!table) {
        console.error("Table not found in container");
        return null;
    }

    console.log("Found table, setting up features");

    // 確保表格足夠寬以顯示所有數據
    const spreadsheetContainer = container.querySelector('.spreadsheet-container');
    if (spreadsheetContainer) {
        const minTableWidth = Math.max(table.offsetWidth, spreadsheetContainer.offsetWidth + 200);

        // 強制表格寬度超過容器以顯示水平滾動條
        if (table.offsetWidth <= spreadsheetContainer.offsetWidth) {
            table.style.minWidth = minTableWidth + 'px';
        }

        // 確保容器能夠水平滾動
        spreadsheetContainer.scrollLeft = 0;
    }

    // 重置選擇狀態
    selectedElement = null;
    selectedType = null;
    selectedElements = [];
    multiSelectMode = false;

    // 創建右鍵選單（如果不存在）
    createContextMenu();

    return table;
}

/**
 * 創建右鍵選單（如果不存在）
 */
export function createContextMenu() {
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

    contextMenu.appendChild(deleteMenuItem);
    document.body.appendChild(contextMenu);

    // 創建多選操作提示
    createMultiSelectHint();

    console.log("Context menu created and added to document");
}

/**
 * 創建多選操作提示
 */
export function createMultiSelectHint() {
    const existingHint = document.getElementById('multi-select-hint');
    if (existingHint) return;

    const hint = document.createElement('div');
    hint.id = 'multi-select-hint';
    hint.className = 'multi-select-hint';
    hint.textContent = '按住 Shift 鍵進行多選';

    document.body.appendChild(hint);
}

/**
 * 清除選擇
 */
export function clearSelection() {
    console.log("Clearing selection");
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 清除單選列樣式
    table.querySelectorAll('.selected-column').forEach(cell => {
        cell.classList.remove('selected-column');
    });

    // 清除單選行樣式
    table.querySelectorAll('.selected-row').forEach(row => {
        row.classList.remove('selected-row');
    });

    // 清除單選單元格樣式
    table.querySelectorAll('.selected').forEach(cell => {
        cell.classList.remove('selected');
    });

    // 如果不是多選模式，也清除多選樣式
    if (!multiSelectMode) {
        // 清除多選列樣式
        table.querySelectorAll('.multi-selected-column').forEach(cell => {
            cell.classList.remove('multi-selected-column');
        });

        // 清除多選行樣式
        table.querySelectorAll('.multi-selected-row').forEach(row => {
            row.classList.remove('multi-selected-row');
        });

        // 清除多選標題樣式
        table.querySelectorAll('.multi-selected').forEach(header => {
            header.classList.remove('multi-selected');
        });

        // 清除多選陣列
        selectedElements = [];
    }

    // 重置選擇追踪
    if (!multiSelectMode) {
        selectedElement = null;
        selectedType = null;
    }
}

/**
 * 選擇整列
 * @param {number} colIndex - 列索引
 */
export function selectColumn(colIndex) {
    console.log("Selecting column", colIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) {
        console.error("Table not found");
        return;
    }

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

/**
 * 選擇整行
 * @param {number} rowIndex - 行索引
 */
export function selectRow(rowIndex) {
    console.log("Selecting row", rowIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) {
        console.error("Table not found");
        return;
    }

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

/**
 * 多選模式下選擇列
 * @param {number} colIndex - 列索引
 */
export function selectColumnMulti(colIndex) {
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 選擇標題
    const header = table.querySelector(`th.column-header[data-col="${colIndex}"]`);
    if (header) {
        header.classList.add('multi-selected');
    }

    // 選擇所有單元格
    const cells = table.querySelectorAll(`td[data-col="${colIndex}"]`);
    cells.forEach(cell => {
        cell.classList.add('multi-selected-column');
    });
}

/**
 * 多選模式下選擇行
 * @param {number} rowIndex - 行索引
 */
export function selectRowMulti(rowIndex) {
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 選擇行標題
    const header = table.querySelector(`td.row-header[data-row="${rowIndex}"]`);
    if (header) {
        header.classList.add('multi-selected');
    }

    // 選擇整行
    const row = table.querySelector(`tr[data-row="${rowIndex}"]`);
    if (row) {
        row.classList.add('multi-selected-row');
    }
}

/**
 * 取消選擇列
 * @param {number} colIndex - 列索引
 */
export function unselectColumn(colIndex) {
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 取消選擇標題
    const header = table.querySelector(`th.column-header[data-col="${colIndex}"]`);
    if (header) {
        header.classList.remove('multi-selected');
        header.classList.remove('selected');
    }

    // 取消選擇所有單元格
    const cells = table.querySelectorAll(`td[data-col="${colIndex}"]`);
    cells.forEach(cell => {
        cell.classList.remove('multi-selected-column');
        cell.classList.remove('selected-column');
    });
}

/**
 * 取消選擇行
 * @param {number} rowIndex - 行索引
 */
export function unselectRow(rowIndex) {
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 取消選擇行標題
    const header = table.querySelector(`td.row-header[data-row="${rowIndex}"]`);
    if (header) {
        header.classList.remove('multi-selected');
        header.classList.remove('selected');
    }

    // 取消選擇整行
    const row = table.querySelector(`tr[data-row="${rowIndex}"]`);
    if (row) {
        row.classList.remove('multi-selected-row');
        row.classList.remove('selected-row');
    }
}

/**
 * 刪除行 - 透過 htmx 發送請求，伺服器回傳更新後的表格 HTML
 * @param {number} rowIndex - 要刪除的行索引
 * @param {boolean} skipConfirm - 跳過確認（批次刪除時由呼叫端統一確認）
 */
export function deleteRow(rowIndex, skipConfirm = false) {
    console.log("Deleting row", rowIndex);
    const filename = getCurrentFilename();
    if (!filename) {
        console.error("No filename found");
        return;
    }

    if (!skipConfirm && !confirm('確定要刪除此行嗎？')) return;

    clearSelection();

    htmx.ajax('DELETE',
        `/api/delete-row?filename=${encodeURIComponent(filename)}&row=${rowIndex}`,
        { target: '#data-container', swap: 'innerHTML' }
    );
}

/**
 * 刪除列 - 透過 htmx 發送請求，伺服器回傳更新後的表格 HTML
 * @param {number} colIndex - 要刪除的列索引
 * @param {boolean} skipConfirm - 跳過確認（批次刪除時由呼叫端統一確認）
 */
export function deleteColumn(colIndex, skipConfirm = false) {
    console.log("Deleting column", colIndex);
    const filename = getCurrentFilename();
    if (!filename) {
        console.error("No filename found");
        return;
    }

    if (!skipConfirm && !confirm('確定要刪除此列嗎？')) return;

    clearSelection();

    htmx.ajax('DELETE',
        `/api/delete-column?filename=${encodeURIComponent(filename)}&column=${colIndex}`,
        { target: '#data-container', swap: 'innerHTML' }
    );
}

/**
 * 將列索引轉換為字母標籤 (A, B, C, ..., Z, AA, AB, ...)
 * @param {number} i - 列索引
 * @returns {string} - 列標籤
 */
export function columnToLetter(i) {
    let result = '';
    i = parseInt(i);

    do {
        const mod = i % 26;
        result = String.fromCharCode(65 + mod) + result;
        i = Math.floor(i / 26) - 1;
    } while (i >= 0);

    return result;
}

/**
 * 顯示多選提示
 */
export function showMultiSelectHint() {
    const hint = document.getElementById('multi-select-hint');
    if (hint) {
        hint.style.display = 'block';
    }
}

/**
 * 隱藏多選提示
 */
export function hideMultiSelectHint() {
    const hint = document.getElementById('multi-select-hint');
    if (hint) {
        hint.style.display = 'none';
    }
}

/**
 * 切換列選擇狀態（多選模式）
 * @param {number} colIndex - 列索引
 */
export function toggleColumnSelection(colIndex) {
    console.log("Toggling column selection", colIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 進入多選模式
    multiSelectMode = true;

    // 檢查此列是否已被選中
    const isAlreadySelected = selectedElements.some(item =>
        item.type === 'column' && item.index === colIndex
    );

    if (isAlreadySelected) {
        // 移除選擇
        unselectColumn(colIndex);

        // 從選中元素列表中移除
        selectedElements = selectedElements.filter(item =>
            !(item.type === 'column' && item.index === colIndex)
        );
    } else {
        // 添加選擇
        selectColumnMulti(colIndex);

        // 添加到選中元素列表
        selectedElements.push({
            type: 'column',
            index: colIndex
        });
    }
}

/**
 * 切換行選擇狀態（多選模式）
 * @param {number} rowIndex - 行索引
 */
export function toggleRowSelection(rowIndex) {
    console.log("Toggling row selection", rowIndex);
    const table = document.querySelector('.spreadsheet-table table');
    if (!table) return;

    // 進入多選模式
    multiSelectMode = true;

    // 檢查此行是否已被選中
    const isAlreadySelected = selectedElements.some(item =>
        item.type === 'row' && item.index === rowIndex
    );

    if (isAlreadySelected) {
        // 移除選擇
        unselectRow(rowIndex);

        // 從選中元素列表中移除
        selectedElements = selectedElements.filter(item =>
            !(item.type === 'row' && item.index === rowIndex)
        );
    } else {
        // 添加選擇
        selectRowMulti(rowIndex);

        // 添加到選中元素列表
        selectedElements.push({
            type: 'row',
            index: rowIndex
        });
    }
}
