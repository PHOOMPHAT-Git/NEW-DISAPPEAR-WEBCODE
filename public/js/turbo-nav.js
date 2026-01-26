(function() {
    'use strict';

    const prefetchedUrls = new Set();
    const pageCache = new Map();
    const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

    // Create loading bar element
    const loadingBar = document.createElement('div');
    loadingBar.id = 'turbo-loading-bar';
    loadingBar.innerHTML = '<div class="turbo-loading-progress"></div>';
    document.body.appendChild(loadingBar);

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #turbo-loading-bar {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 3px;
            z-index: 99999;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        }
        #turbo-loading-bar.loading {
            opacity: 1;
        }
        .turbo-loading-progress {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s ease;
        }
        #turbo-loading-bar.loading .turbo-loading-progress {
            animation: turbo-loading 1.5s ease-in-out infinite;
        }
        @keyframes turbo-loading {
            0% { width: 0%; }
            50% { width: 70%; }
            100% { width: 90%; }
        }
        .turbo-fade-out {
            opacity: 0 !important;
            transition: opacity 0.15s ease !important;
        }
        .turbo-fade-in {
            animation: turbo-fade-in 0.15s ease;
        }
        @keyframes turbo-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    function shouldPrefetch(url) {
        if (!url) return false;

        try {
            const urlObj = new URL(url, window.location.origin);

            // Only prefetch same-origin URLs
            if (urlObj.origin !== window.location.origin) return false;

            // Skip hash links
            if (urlObj.pathname === window.location.pathname && urlObj.hash) return false;

            // Skip already prefetched
            if (prefetchedUrls.has(urlObj.pathname)) return false;

            // Skip certain paths
            const skipPaths = ['/logout', '/api/', '/socket.io/', '/minigame/bomb-chip'];
            if (skipPaths.some(p => urlObj.pathname.startsWith(p))) return false;

            return true;
        } catch (e) {
            return false;
        }
    }

    function prefetchUrl(url) {
        if (!shouldPrefetch(url)) return;

        const urlObj = new URL(url, window.location.origin);
        prefetchedUrls.add(urlObj.pathname);

        // Use link prefetch for browser-level caching
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);

        // Also fetch into our cache for instant navigation
        fetch(url, {
            credentials: 'same-origin',
            headers: { 'X-Turbo-Prefetch': 'true' }
        })
        .then(response => {
            if (response.ok) {
                return response.text();
            }
        })
        .then(html => {
            if (html) {
                pageCache.set(urlObj.pathname, {
                    html,
                    timestamp: Date.now()
                });
            }
        })
        .catch(() => {});
    }

    function getCachedPage(pathname) {
        const cached = pageCache.get(pathname);
        if (!cached) return null;

        // Check if cache is still valid
        if (Date.now() - cached.timestamp > CACHE_MAX_AGE) {
            pageCache.delete(pathname);
            return null;
        }

        return cached.html;
    }

    function showLoading() {
        loadingBar.classList.add('loading');
    }

    function hideLoading() {
        const progress = loadingBar.querySelector('.turbo-loading-progress');
        progress.style.width = '100%';
        setTimeout(() => {
            loadingBar.classList.remove('loading');
            progress.style.width = '0%';
        }, 200);
    }

    function navigateTo(url, useCache = true) {
        const urlObj = new URL(url, window.location.origin);

        // Check cache first
        if (useCache) {
            const cachedHtml = getCachedPage(urlObj.pathname);
            if (cachedHtml) {
                performNavigation(url, cachedHtml);
                return;
            }
        }

        showLoading();

        fetch(url, { credentials: 'same-origin' })
            .then(response => {
                if (!response.ok) throw new Error('Navigation failed');
                return response.text();
            })
            .then(html => {
                performNavigation(url, html);
            })
            .catch(() => {
                // Fallback to normal navigation
                window.location.href = url;
            });
    }

    function performNavigation(url, html) {
        // Use View Transitions API if available
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                replaceDocument(url, html);
            });
        } else {
            // Fallback: fade transition
            document.body.classList.add('turbo-fade-out');
            setTimeout(() => {
                replaceDocument(url, html);
                document.body.classList.remove('turbo-fade-out');
                document.body.classList.add('turbo-fade-in');
                setTimeout(() => {
                    document.body.classList.remove('turbo-fade-in');
                }, 150);
            }, 150);
        }

        hideLoading();
    }

    async function replaceDocument(url, html) {
        // Parse the new HTML
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(html, 'text/html');

        // Update title
        document.title = newDoc.title;

        // Update head (stylesheets and meta) FIRST and wait for CSS to load
        await updateHead(newDoc.head);

        // Replace body content
        document.body.innerHTML = newDoc.body.innerHTML;

        // Copy body attributes
        Array.from(newDoc.body.attributes).forEach(attr => {
            document.body.setAttribute(attr.name, attr.value);
        });

        // Update URL
        history.pushState({}, '', url);

        // Re-execute scripts
        executeScripts(document.body);

        // Re-initialize turbo nav listeners
        initListeners();

        // Scroll to top
        window.scrollTo(0, 0);

        // Dispatch event for other scripts
        window.dispatchEvent(new CustomEvent('turbo:load'));
    }

    async function updateHead(newHead) {
        const newStyles = new Set(
            Array.from(newHead.querySelectorAll('link[rel="stylesheet"]'))
                .map(l => l.href)
        );

        // Remove old page-specific stylesheets that are not in the new page
        document.head.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            // Keep common stylesheets (components, fonts, etc.)
            const isCommon = link.href.includes('/components/') ||
                           link.href.includes('fonts.googleapis.com') ||
                           link.href.includes('/alert.css');

            if (!isCommon && !newStyles.has(link.href)) {
                link.remove();
            }
        });

        // Add new stylesheets and wait for them to load
        const currentStyles = new Set(
            Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
                .map(l => l.href)
        );

        const loadPromises = [];

        newHead.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            if (!currentStyles.has(link.href)) {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = link.href;

                // Create a promise that resolves when the stylesheet loads
                const loadPromise = new Promise((resolve) => {
                    newLink.onload = resolve;
                    newLink.onerror = resolve; // Resolve even on error to not block
                    // Timeout fallback in case onload doesn't fire
                    setTimeout(resolve, 500);
                });

                loadPromises.push(loadPromise);
                document.head.appendChild(newLink);
            }
        });

        // Wait for all new stylesheets to load
        if (loadPromises.length > 0) {
            await Promise.all(loadPromises);
        }
    }

    function executeScripts(container) {
        const scripts = container.querySelectorAll('script');
        scripts.forEach(oldScript => {
            // Skip turbo-nav script itself
            if (oldScript.src && oldScript.src.includes('turbo-nav.js')) return;

            const newScript = document.createElement('script');

            if (oldScript.src) {
                newScript.src = oldScript.src;
            } else {
                newScript.textContent = oldScript.textContent;
            }

            // Copy attributes
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    }

    function handleClick(e) {
        // Find the closest anchor
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // Skip if modifier keys pressed
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        // Skip if target="_blank"
        if (link.target === '_blank') return;

        // Skip external links
        try {
            const urlObj = new URL(href, window.location.origin);
            if (urlObj.origin !== window.location.origin) return;

            // Skip certain paths (including WebSocket-heavy pages)
            const skipPaths = ['/logout', '/api/', '/socket.io/', '/minigame/bomb-chip'];
            if (skipPaths.some(p => urlObj.pathname.startsWith(p))) return;

            // Skip if data-turbo="false"
            if (link.dataset.turbo === 'false') return;

            e.preventDefault();
            navigateTo(href);
        } catch (err) {
            return;
        }
    }

    function handleHover(e) {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        prefetchUrl(href);
    }

    function handleButtonClick(e) {
        const btn = e.target.closest('button[onclick]');
        if (!btn) return;

        const onclick = btn.getAttribute('onclick');
        if (!onclick) return;

        // Match window.location.href = '...'
        const match = onclick.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (!match) return;

        const href = match[1];

        try {
            const urlObj = new URL(href, window.location.origin);
            if (urlObj.origin !== window.location.origin) return;

            // Skip certain paths (including WebSocket-heavy pages)
            const skipPaths = ['/logout', '/api/', '/socket.io/', '/minigame/bomb-chip'];
            if (skipPaths.some(p => urlObj.pathname.startsWith(p))) return;

            e.preventDefault();
            e.stopPropagation();
            navigateTo(href);
        } catch (err) {
            return;
        }
    }

    function handleButtonHover(e) {
        const btn = e.target.closest('button[onclick]');
        if (!btn) return;

        const onclick = btn.getAttribute('onclick');
        if (!onclick) return;

        const match = onclick.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
            prefetchUrl(match[1]);
        }
    }

    function initListeners() {
        // Handle link clicks
        document.addEventListener('click', handleClick, true);

        // Handle button clicks with onclick="window.location.href='...'"
        document.addEventListener('click', handleButtonClick, true);

        // Prefetch on hover
        document.addEventListener('mouseover', handleHover, { passive: true });
        document.addEventListener('mouseover', handleButtonHover, { passive: true });

        // Also prefetch on touchstart for mobile
        document.addEventListener('touchstart', handleHover, { passive: true });
        document.addEventListener('touchstart', handleButtonHover, { passive: true });
    }

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
        navigateTo(window.location.href, true);
    });

    // Initialize
    initListeners();

    // Expose for debugging
    window.TurboNav = {
        prefetch: prefetchUrl,
        navigate: navigateTo,
        clearCache: () => pageCache.clear()
    };
})();
