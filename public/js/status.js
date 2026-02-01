(function() {
    const STATUS_LABELS = {
        online: 'Online',
        offline: 'Offline',
        maintenance: 'Maintenance',
        degraded: 'Degraded'
    };

    function updateStatusDisplay(services) {
        // Update website status
        const websiteIndicator = document.getElementById('website-status');
        const websiteText = document.getElementById('website-status-text');
        if (websiteIndicator && websiteText) {
            const websiteStatus = services.website?.status || 'online';
            websiteIndicator.className = 'status-indicator ' + websiteStatus;
            websiteText.textContent = STATUS_LABELS[websiteStatus] || websiteStatus;
        }

        // Update bot status
        const botIndicator = document.getElementById('bot-status');
        const botText = document.getElementById('bot-status-text');
        if (botIndicator && botText) {
            const botStatus = services['discord-bot']?.status || 'offline';
            botIndicator.className = 'status-indicator ' + botStatus;
            botText.textContent = STATUS_LABELS[botStatus] || botStatus;
        }
    }

    async function fetchStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();

            if (data.success && data.services) {
                updateStatusDisplay(data.services);
            }
        } catch (error) {
            console.error('Failed to fetch status:', error);
            updateStatusDisplay({
                website: { status: 'online' },
                'discord-bot': { status: 'offline' }
            });
        }
    }

    // Fetch status on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fetchStatus);
    } else {
        fetchStatus();
    }

    // Refresh status every 15 seconds
    setInterval(fetchStatus, 15000);
})();
