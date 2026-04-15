// api.js - 共用工具函式

/**
 * 獲取當前顯示的文件名
 * @returns {string} - 當前文件名
 */
export function getCurrentFilename() {
    const sheetTitle = document.querySelector('.sheet-title h2');
    let filename = '';
    if (sheetTitle) {
        const titleText = sheetTitle.textContent;
        filename = titleText.split(' - ')[0].trim();
    }
    return filename;
}
