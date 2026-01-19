// Scan service for displaying battery information
// This file handles the scan view when accessing /{sticker_id}

let durationTimer = null;

// Parse duration string (HH:MM:SS) to total seconds
function parseDurationToSeconds(durationString) {
    const parts = durationString.split(':');
    if (parts.length !== 3) return 0;
    
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
}

// Format total seconds to HH:MM:SS
function formatSecondsToDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Start duration count-up timer
function startDurationTimer(initialDuration) {
    // Clear any existing timer
    if (durationTimer) {
        clearInterval(durationTimer);
    }
    
    const durationElement = document.getElementById('batteryDuration');
    if (!durationElement) return;
    
    // Parse initial duration to seconds
    let totalSeconds = parseDurationToSeconds(initialDuration);
    
    // Update immediately
    durationElement.textContent = formatSecondsToDuration(totalSeconds);
    
    // Increment every second
    durationTimer = setInterval(() => {
        totalSeconds++;
        durationElement.textContent = formatSecondsToDuration(totalSeconds);
    }, 1000);
}

// Stop duration timer
function stopDurationTimer() {
    if (durationTimer) {
        clearInterval(durationTimer);
        durationTimer = null;
    }
}

// Get sticker_id from URL path
function getStickerIdFromPath() {
    const path = window.location.pathname;
    // Remove leading slash and get the sticker_id
    const stickerId = path.replace(/^\//, '');
    // If it's empty or matches known routes, return null
    if (!stickerId || stickerId === 'map' || stickerId === 'api') {
        return null;
    }
    return stickerId;
}

// Fetch battery data from CUUB API
async function fetchBatteryData(stickerId) {
    try {
        const response = await fetch(`/api/battery/${stickerId}`);
        const result = await response.json();
        
        if (result.success && result.data) {
            return result.data;
        } else {
            console.error('Failed to fetch battery data:', result);
            return null;
        }
    } catch (error) {
        console.error('Error fetching battery data:', error);
        return null;
    }
}

// Create scan record
async function createScanRecord(stickerId, manufactureId) {
    try {
        const response = await fetch(`/api/battery/${stickerId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'manufacture_id': manufactureId,
                'sticker_type': 'type one'
            },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Scan record created successfully:', result.data);
            return result.data;
        } else {
            console.error('Failed to create scan record:', result);
            return null;
        }
    } catch (error) {
        console.error('Error creating scan record:', error);
        return null;
    }
}

// Show battery info modal
function showBatteryModal(batteryData) {
    const modal = document.getElementById('batteryModal');
    const paidElement = document.getElementById('batteryPaid');
    
    if (batteryData && modal) {
        const initialDuration = batteryData.duration || '00:00:00';
        
        // Start the count-up timer
        startDurationTimer(initialDuration);
        
        // Set paid amount
        paidElement.textContent = `$${batteryData.amountPaid || 0}`;
        
        // Show modal
        modal.classList.add('active');
    }
}

// Hide battery info modal
function hideBatteryModal() {
    const modal = document.getElementById('batteryModal');
    if (modal) {
        modal.classList.remove('active');
        // Stop the timer when modal is hidden
        stopDurationTimer();
    }
}

// Initialize scan service
function initScanService() {
    const stickerId = getStickerIdFromPath();
    
    if (stickerId) {
        // Fetch and display battery data
        fetchBatteryData(stickerId).then(batteryData => {
            if (batteryData) {
                showBatteryModal(batteryData);
                
                // Immediately create scan record after fetching battery data
                if (batteryData.manufacture_id) {
                    createScanRecord(stickerId, batteryData.manufacture_id);
                }
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScanService);
} else {
    initScanService();
}
