// init.js - 主要的 JavaScript 入口，負責初始化所有功能

import { initializeTable } from './table.js';
import { setupUploadEvents, setupEventListeners } from './event.js';

// 在 DOM 加載完成後初始化
document.addEventListener('DOMContentLoaded', function () {
    console.log("Document loaded, initializing app");

    // 設置上傳文件相關事件
    setupUploadEvents();

    // 設置 htmx 事件
    setupHtmxEvents();

    // 設置 htmx 錯誤處理
    setupHtmxErrorHandling();
});

// htmx afterSwap：表格載入後重新綁定事件
function setupHtmxEvents() {
    document.addEventListener('htmx:afterSwap', function (event) {
        if (event.detail.target.id === 'data-container') {
            const table = initializeTable(event.detail.target);
            if (table) {
                setupEventListeners(table);
            }
        }
    });

    // 瀏覽器上/下一頁：htmx 設定了 HX-Push-Url，popstate 時重新載入對應頁面
    window.addEventListener('popstate', function () {
        window.location.reload();
    });
}

// htmx 錯誤處理：伺服器錯誤和網路錯誤
function setupHtmxErrorHandling() {
    // 伺服器回傳非 2xx 狀態碼
    document.addEventListener('htmx:responseError', function (event) {
        const xhr = event.detail.xhr;
        const status = xhr ? xhr.status : 'unknown';
        const body = xhr ? xhr.responseText : '';
        console.error('htmx responseError:', status, body);
        showToast(body || `操作失敗 (${status})，請重試`);
    });

    // 網路連線錯誤
    document.addEventListener('htmx:sendError', function (event) {
        console.error('htmx sendError:', event.detail);
        showToast('網路連線錯誤，請檢查連線後重試');
    });
}

// 簡易 toast 通知
function showToast(message) {
    // 移除既有的 toast
    const existing = document.getElementById('htmx-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'htmx-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#d32f2f',
        color: '#fff',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        zIndex: '10000',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        transition: 'opacity 0.3s ease',
        opacity: '1'
    });

    document.body.appendChild(toast);

    // 3 秒後淡出移除
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
