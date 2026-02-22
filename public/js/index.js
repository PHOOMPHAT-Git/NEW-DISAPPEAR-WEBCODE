(function () {
    'use strict';

    let idleTimer = null;
    let isHovering = false;

    function initLogo() {
        clearTimeout(idleTimer);
        isHovering = false;

        const logoText = document.getElementById('logo-text');
        if (!logoText) return;

        const letters = Array.from(logoText.querySelectorAll('.logo-letter'));

        // ── Shatter on hover ────────────────────────────────────────
        function shatter() {
            letters.forEach(function (l) {
                l.classList.remove('idle-ghost');
                l.style.setProperty('--dx', ((Math.random() - 0.5) * 320) + 'px');
                l.style.setProperty('--dy', ((Math.random() - 0.5) * 220) + 'px');
                l.style.setProperty('--dr', ((Math.random() - 0.5) * 130) + 'deg');
                l.style.setProperty('--ds', 0.15 + Math.random() * 0.45);
            });
            logoText.classList.add('shattering');
        }

        function reassemble() {
            logoText.classList.remove('shattering');
        }

        // ── Idle: random letters vanish and return ──────────────────
        function scheduleIdle() {
            idleTimer = setTimeout(function () {
                if (!isHovering && !logoText.classList.contains('glitching')) {
                    const count = Math.random() < 0.25 ? 2 : 1;
                    for (let c = 0; c < count; c++) {
                        const l = letters[Math.floor(Math.random() * letters.length)];
                        if (!l.classList.contains('idle-ghost')) {
                            l.classList.add('idle-ghost');
                            setTimeout(function () {
                                l.classList.remove('idle-ghost');
                            }, 1400);
                        }
                    }
                }
                scheduleIdle();
            }, 1000 + Math.random() * 1200);
        }

        // ── Events ──────────────────────────────────────────────────
        logoText.addEventListener('mouseenter', function () {
            isHovering = true;
            shatter();
        });

        logoText.addEventListener('mouseleave', function () {
            isHovering = false;
            reassemble();
        });

        scheduleIdle();
    }

    initLogo();
    window.addEventListener('turbo:load', initLogo);
})();
