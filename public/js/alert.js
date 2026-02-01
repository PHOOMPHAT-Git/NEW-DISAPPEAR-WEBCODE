(function() {
    function createToastArea() {
        if (document.getElementById('toast-area')) return;
        const area = document.createElement('div');
        area.id = 'toast-area';
        area.className = 'toast-area';
        document.body.appendChild(area);
    }

    function showToast(message, type = 'info', duration = 5000) {
        createToastArea();

        const area = document.getElementById('toast-area');
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.setAttribute('role', 'alert');

        const bar = document.createElement('span');
        bar.className = 'toast__bar';

        const content = document.createElement('div');
        content.className = 'toast__content';

        const icon = document.createElement('span');
        icon.className = 'toast__icon';
        icon.innerHTML = getIcon(type);

        const text = document.createElement('div');
        text.className = 'toast__text';
        text.textContent = message;

        content.appendChild(icon);
        content.appendChild(text);
        toast.appendChild(bar);
        toast.appendChild(content);
        area.appendChild(toast);

        let hideTimer = setTimeout(closeToast, duration);

        toast.addEventListener('mouseenter', () => {
            clearTimeout(hideTimer);
        });

        toast.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(closeToast, duration);
        });

        toast.addEventListener('click', closeToast);

        function closeToast() {
            clearTimeout(hideTimer);
            toast.classList.add('toast--closing');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        }
    }

    function getIcon(type) {
        const icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };
        return icons[type] || icons.info;
    }

    window.toast = {
        show: showToast,
        success: (msg, duration) => showToast(msg, 'success', duration),
        error: (msg, duration) => showToast(msg, 'error', duration),
        warning: (msg, duration) => showToast(msg, 'warning', duration),
        info: (msg, duration) => showToast(msg, 'info', duration)
    };

    document.addEventListener('DOMContentLoaded', createToastArea);
})();
