const isEditable = (el) => {
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
};

const isInteractive = (el) => {
    if (!el) return false;
    if (isEditable(el)) return true;
    const node = el.closest && el.closest('a,button,select,option,label,summary,details,[role="button"],[role="link"],[tabindex]');
    return !!node;
};

const clearSelection = () => {
    const sel = window.getSelection ? window.getSelection() : null;
    if (sel && sel.rangeCount) sel.removeAllRanges();
};

document.addEventListener('contextmenu', (e) => {
    if (isEditable(e.target)) return;
    e.preventDefault();
}, { capture: true });

document.addEventListener('selectstart', (e) => {
    if (isEditable(e.target)) return;
    e.preventDefault();
}, { capture: true });

document.addEventListener('dragstart', (e) => {
    if (isEditable(e.target)) return;
    e.preventDefault();
}, { capture: true });

const pointerStart = new Map();
const DRAG_PX = 4;

document.addEventListener('pointerdown', (e) => {
    const a = document.activeElement;
    if (isEditable(a) && !isEditable(e.target)) a.blur();

    if (isInteractive(e.target)) return;
    pointerStart.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    clearSelection();
}, { capture: true, passive: true });

document.addEventListener('pointermove', (e) => {
    if (isEditable(e.target) || isInteractive(e.target)) return;

    const s = pointerStart.get(e.pointerId);
    if (!s) return;

    const dx = Math.abs(e.clientX - s.x);
    const dy = Math.abs(e.clientY - s.y);

    if ((e.buttons & 1) === 1 && (dx > DRAG_PX || dy > DRAG_PX)) {
        e.preventDefault();
        clearSelection();
    }
}, { capture: true, passive: false });

document.addEventListener('pointerup', (e) => {
    pointerStart.delete(e.pointerId);
}, { capture: true, passive: true });

document.addEventListener('pointercancel', (e) => {
    pointerStart.delete(e.pointerId);
}, { capture: true, passive: true });

document.addEventListener('selectionchange', () => {
    const a = document.activeElement;
    if (isEditable(a)) return;
    clearSelection();
}, { capture: true });

document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const code = (e.code || '').toLowerCase();

    if (key === 'f12' || code === 'f12') {
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    if (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || code === 'keyi' || code === 'keyj' || code === 'keyc')) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    if (e.ctrlKey && (key === 'u' || code === 'keyu')) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
}, { capture: true });

const style = document.createElement('style');
style.textContent = `
    html, body, * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-tap-highlight-color: transparent;
    }
    input, textarea, [contenteditable="true"] {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
    }
    img {
        -webkit-user-drag: none !important;
        user-drag: none !important;
        pointer-events: none;
    }
`;
document.head.appendChild(style);