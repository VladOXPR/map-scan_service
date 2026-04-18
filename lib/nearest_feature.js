// CUUB "Find nearest station" feature module.
// Injects its own CSS + DOM (once), owns a small Mapbox source/layer for the
// nearest-station halo, and handles the prompt modal, location request,
// user-location marker, info card, toast, and re-open button.
//
// Usage (per-page):
//   const feature = window.CuubNearest.attach({
//       map: mapInstance,
//       mapboxgl: window.mapboxgl,
//       isStickerPage: false
//   });
//   // later, once stations are fetched:
//   feature.setStations(stationsArray);
//
// The module NEVER sends user coordinates to any server.

(function (global) {
    'use strict';

    var STYLE_ID = 'cuub-nearest-style';
    var DOM_ID = 'cuub-nearest-dom-root';
    var LOC_SESSION_KEY = 'cuub:locationPrompt';
    var FAR_STATION_METERS = 50000;
    var HALO_SOURCE_ID = 'cuub-nearest';
    var HALO_LAYER_ID = 'cuub-nearest-halo';

    var CSS = [
        '/* CUUB nearest-station feature (injected) */',
        '.cuub-nearest-button {',
        '  position: fixed; bottom: 20px; left: 20px;',
        '  background-color: #000000; color: #ffffff; border: none;',
        '  border-radius: 28px; padding: 12px 20px;',
        '  font-size: 14px; font-weight: 600; cursor: pointer;',
        '  z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);',
        '  transition: transform 0.2s, box-shadow 0.2s, bottom 0.3s ease-out;',
        '  white-space: nowrap;',
        '  font-family: inherit;',
        '}',
        '.cuub-nearest-button:hover { transform: scale(1.05); box-shadow: 0 6px 16px rgba(0,0,0,0.4); }',
        '.cuub-nearest-button:active { transform: scale(0.95); }',
        '.cuub-nearest-button:focus-visible { outline: 2px solid #0198FD; outline-offset: 2px; }',
        '',
        '.cuub-loc-backdrop {',
        '  position: fixed; inset: 0; background-color: rgba(0,0,0,0.55);',
        '  z-index: 2000; opacity: 0; pointer-events: none;',
        '  transition: opacity 0.2s ease-out;',
        '}',
        '.cuub-loc-backdrop.active { opacity: 1; pointer-events: auto; }',
        '',
        '.cuub-loc-modal {',
        '  position: fixed; top: 50%; left: 50%;',
        '  transform: translate(-50%, -50%) scale(0.96);',
        '  width: calc(100% - 40px); max-width: 380px;',
        '  background-color: #000000; color: #ffffff;',
        '  border-radius: 16px; padding: 24px; z-index: 2001;',
        '  box-shadow: 0 20px 60px rgba(0,0,0,0.5);',
        '  opacity: 0; pointer-events: none;',
        '  transition: opacity 0.2s ease-out, transform 0.2s ease-out;',
        '  font-family: inherit;',
        '}',
        '.cuub-loc-modal.active { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%) scale(1); }',
        '.cuub-loc-modal-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }',
        '.cuub-loc-modal-desc { font-size: 14px; color: #c7c7c7; margin-bottom: 20px; line-height: 1.4; }',
        '.cuub-loc-modal-actions { display: flex; gap: 10px; }',
        '.cuub-loc-btn { flex: 1; padding: 12px 14px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: background-color 0.2s, opacity 0.2s; }',
        '.cuub-loc-btn-primary { background-color: #0198FD; color: #ffffff; }',
        '.cuub-loc-btn-primary:active { background-color: #0178CD; }',
        '.cuub-loc-btn-secondary { background-color: transparent; color: #ffffff; border: 1px solid rgba(255,255,255,0.25); }',
        '.cuub-loc-btn-secondary:active { background-color: rgba(255,255,255,0.08); }',
        '.cuub-loc-btn:focus-visible { outline: 2px solid #0198FD; outline-offset: 2px; }',
        '',
        '.cuub-nearest-card {',
        '  position: fixed; top: 20px; left: 50%;',
        '  transform: translate(-50%, -120%);',
        '  width: calc(100% - 40px); max-width: 380px;',
        '  background-color: #000000; color: #ffffff;',
        '  border-radius: 14px; padding: 14px 16px; z-index: 1000;',
        '  box-shadow: 0 6px 20px rgba(0,0,0,0.35);',
        '  display: flex; flex-direction: column; gap: 10px;',
        '  transition: transform 0.3s ease-out, opacity 0.2s ease-out;',
        '  opacity: 0; font-family: inherit;',
        '}',
        '.cuub-nearest-card.active { transform: translate(-50%, 0); opacity: 1; }',
        // On sticker pages the battery modal occupies the top; shift the card down so both fit.
        'body.cuub-sticker-page .cuub-nearest-card { top: 290px; }',
        '.cuub-nearest-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }',
        '.cuub-nearest-card-label { color: #808080; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }',
        '.cuub-nearest-card-name { font-size: 16px; font-weight: 600; line-height: 1.25; margin-top: 2px; word-break: break-word; }',
        '.cuub-nearest-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }',
        '.cuub-nearest-card-distance { color: #0198FD; font-size: 13px; font-weight: 600; }',
        '.cuub-nearest-card-slots { display: flex; gap: 14px; align-items: center; }',
        '.cuub-nearest-slot { display: flex; align-items: center; gap: 6px; color: #ffffff; font-size: 13px; }',
        '.cuub-nearest-slot-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }',
        '.cuub-nearest-slot-dot.filled { background-color: #0198FD; }',
        '.cuub-nearest-slot-dot.open { background-color: #808080; }',
        '.cuub-nearest-slot-number { font-weight: 600; }',
        '.cuub-nearest-slot-label { color: #c7c7c7; font-size: 12px; }',
        '.cuub-nearest-card-note { color: #FFB74D; font-size: 11px; }',
        '.cuub-nearest-card-close { background: transparent; border: none; color: #ffffff; font-size: 22px; line-height: 1; cursor: pointer; padding: 2px 4px; opacity: 0.7; align-self: flex-start; font-family: inherit; }',
        '.cuub-nearest-card-close:hover { opacity: 1; }',
        '.cuub-nearest-directions-button { width: 100%; background-color: #0198FD; color: #ffffff; border: none; border-radius: 10px; padding: 12px 14px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background-color 0.2s; margin-top: 2px; font-family: inherit; }',
        '.cuub-nearest-directions-button:active { background-color: #0178CD; }',
        '.cuub-nearest-directions-button:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }',
        '',
        '.cuub-toast {',
        '  position: fixed; bottom: 90px; left: 50%;',
        '  transform: translate(-50%, 20px);',
        '  background-color: #000000; color: #ffffff;',
        '  font-size: 13px; font-weight: 500; padding: 10px 16px;',
        '  border-radius: 10px; z-index: 1500;',
        '  box-shadow: 0 4px 14px rgba(0,0,0,0.35);',
        '  opacity: 0; pointer-events: none;',
        '  transition: opacity 0.2s ease-out, transform 0.2s ease-out;',
        '  max-width: calc(100% - 40px); text-align: center;',
        '  font-family: inherit;',
        '}',
        '.cuub-toast.active { opacity: 1; transform: translate(-50%, 0); }',
        '',
        '.cuub-user-location-marker {',
        '  width: 20px; height: 20px; border-radius: 50%;',
        '  background-color: #0198FD; border: 3px solid #ffffff;',
        '  box-shadow: 0 0 0 2px rgba(1,152,253,0.35);',
        '  position: relative;',
        '}',
        '.cuub-user-location-marker::after {',
        '  content: ""; position: absolute; inset: -10px; border-radius: 50%;',
        '  background-color: rgba(1,152,253,0.25);',
        '  animation: cuub-user-pulse 1.8s ease-out infinite;',
        '}',
        '@keyframes cuub-user-pulse {',
        '  0% { transform: scale(0.6); opacity: 0.8; }',
        '  100% { transform: scale(1.6); opacity: 0; }',
        '}',
        '',
        '.cuub-hidden { display: none !important; }'
    ].join('\n');

    function injectCss() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function injectDom() {
        if (document.getElementById(DOM_ID)) return;
        var root = document.createElement('div');
        root.id = DOM_ID;
        root.innerHTML = [
            '<button type="button" class="cuub-nearest-button cuub-hidden" id="cuubNearestButton" title="Find nearest station">Find nearest station</button>',
            '<div class="cuub-nearest-card cuub-hidden" id="cuubNearestCard" role="status" aria-live="polite" aria-atomic="true">',
            '  <div class="cuub-nearest-card-header">',
            '    <div class="cuub-nearest-card-label">Nearest station</div>',
            '    <button type="button" class="cuub-nearest-card-close" id="cuubNearestCardClose" aria-label="Dismiss nearest station info">&times;</button>',
            '  </div>',
            '  <div class="cuub-nearest-card-name" id="cuubNearestCardName"></div>',
            '  <div class="cuub-nearest-card-meta">',
            '    <div class="cuub-nearest-card-distance" id="cuubNearestCardDistance"></div>',
            '    <div class="cuub-nearest-card-slots">',
            '      <div class="cuub-nearest-slot">',
            '        <span class="cuub-nearest-slot-dot filled"></span>',
            '        <span class="cuub-nearest-slot-number" id="cuubNearestFilledSlots">0</span>',
            '        <span class="cuub-nearest-slot-label">Filled</span>',
            '      </div>',
            '      <div class="cuub-nearest-slot">',
            '        <span class="cuub-nearest-slot-dot open"></span>',
            '        <span class="cuub-nearest-slot-number" id="cuubNearestOpenSlots">0</span>',
            '        <span class="cuub-nearest-slot-label">Open</span>',
            '      </div>',
            '    </div>',
            '  </div>',
            '  <div class="cuub-nearest-card-note cuub-hidden" id="cuubNearestCardNote">Nearest station is far from you</div>',
            '  <button type="button" class="cuub-nearest-directions-button" id="cuubNearestDirectionsButton">Get Directions</button>',
            '</div>',
            '<div class="cuub-toast cuub-hidden" id="cuubLocToast" role="status" aria-live="polite"></div>',
            '<div class="cuub-loc-backdrop cuub-hidden" id="cuubLocBackdrop"></div>',
            '<div class="cuub-loc-modal cuub-hidden" id="cuubLocModal" role="dialog" aria-modal="true" aria-labelledby="cuubLocModalTitle" aria-describedby="cuubLocModalDesc">',
            '  <h2 class="cuub-loc-modal-title" id="cuubLocModalTitle">Find stations near you</h2>',
            '  <p class="cuub-loc-modal-desc" id="cuubLocModalDesc">Share your location to see the nearest CUUB station?</p>',
            '  <div class="cuub-loc-modal-actions">',
            '    <button type="button" class="cuub-loc-btn cuub-loc-btn-secondary" id="cuubLocBtnNo">Not now</button>',
            '    <button type="button" class="cuub-loc-btn cuub-loc-btn-primary" id="cuubLocBtnYes">Yes, share location</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(root);
    }

    // -- helpers ------------------------------------------------------------
    function show(el) { if (el) el.classList.remove('cuub-hidden'); }
    function hide(el) { if (el) el.classList.add('cuub-hidden'); }

    function safeSessionGet(key) {
        try {
            if (!global.sessionStorage) return null;
            return global.sessionStorage.getItem(key);
        } catch (_) { return null; }
    }
    function safeSessionSet(key, value) {
        try {
            if (!global.sessionStorage) return;
            global.sessionStorage.setItem(key, value);
        } catch (_) { /* privacy mode / quota */ }
    }
    function hasGeolocation() {
        return typeof navigator !== 'undefined' && 'geolocation' in navigator;
    }

    // OS maps directions (shared logic w/ station modal).
    function openDirectionsTo(latitude, longitude) {
        if (latitude == null || longitude == null) return;
        var ua = navigator.userAgent || navigator.vendor || global.opera;
        var url;
        if (/iPad|iPhone|iPod/.test(ua) && !global.MSStream) {
            url = 'maps://maps.google.com/maps?daddr=' + latitude + ',' + longitude;
        } else if (/android/i.test(ua)) {
            url = 'google.navigation:q=' + latitude + ',' + longitude;
        } else {
            url = 'https://maps.google.com/maps?daddr=' + latitude + ',' + longitude;
        }
        global.location.href = url;
    }

    function attach(options) {
        options = options || {};
        var map = options.map;
        var mapboxgl = options.mapboxgl || global.mapboxgl;
        var isStickerPage = !!options.isStickerPage;
        if (!map || !mapboxgl) {
            console.warn('[CuubNearest] attach() requires map + mapboxgl');
            return null;
        }

        injectCss();
        injectDom();
        if (isStickerPage) document.body.classList.add('cuub-sticker-page');

        // DOM handles
        var triggerBtn = document.getElementById('cuubNearestButton');
        var card = document.getElementById('cuubNearestCard');
        var cardName = document.getElementById('cuubNearestCardName');
        var cardDistance = document.getElementById('cuubNearestCardDistance');
        var cardFilled = document.getElementById('cuubNearestFilledSlots');
        var cardOpen = document.getElementById('cuubNearestOpenSlots');
        var cardNote = document.getElementById('cuubNearestCardNote');
        var cardClose = document.getElementById('cuubNearestCardClose');
        var cardDirections = document.getElementById('cuubNearestDirectionsButton');
        var toast = document.getElementById('cuubLocToast');
        var backdrop = document.getElementById('cuubLocBackdrop');
        var modalEl = document.getElementById('cuubLocModal');
        var btnYes = document.getElementById('cuubLocBtnYes');
        var btnNo = document.getElementById('cuubLocBtnNo');

        // State
        var stations = [];
        var userCoords = null;
        var userLocationMarker = null;
        var nearestStationObj = null;
        var haloPulseInterval = null;
        var pendingLocateAfterStations = false;
        var lastFocusedBeforeModal = null;
        var modalKeyHandler = null;
        var toastTimeoutId = null;

        // --- Halo layer management -----------------------------------------
        function addHaloLayer() {
            if (!map.getSource(HALO_SOURCE_ID)) {
                map.addSource(HALO_SOURCE_ID, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }
            if (!map.getLayer(HALO_LAYER_ID)) {
                map.addLayer({
                    id: HALO_LAYER_ID,
                    type: 'circle',
                    source: HALO_SOURCE_ID,
                    paint: {
                        'circle-radius': 26,
                        'circle-color': '#0198FD',
                        'circle-opacity': 0.28,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#0198FD',
                        'circle-stroke-opacity': 0.6
                    }
                });
                // Try to slide this layer under the stations point layer if it exists,
                // so the dot renders on top of the halo.
                try {
                    if (map.getLayer('unclustered-point')) {
                        map.moveLayer(HALO_LAYER_ID, 'unclustered-point');
                    }
                } catch (_) { /* noop */ }
            }
        }
        function setHaloStation(station) {
            var data;
            if (station) {
                var lng = parseFloat(station.longitude);
                var lat = parseFloat(station.latitude);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
                    data = { type: 'FeatureCollection', features: [] };
                } else {
                    data = {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [lng, lat] },
                            properties: {}
                        }]
                    };
                }
            } else {
                data = { type: 'FeatureCollection', features: [] };
            }
            var src = map.getSource(HALO_SOURCE_ID);
            if (src) src.setData(data);
        }
        if (map.isStyleLoaded && map.isStyleLoaded()) {
            addHaloLayer();
        } else {
            map.once('load', addHaloLayer);
            // If style reloads (e.g. setStyle), re-add layers.
            map.on('styledata', function () {
                if (!map.getLayer(HALO_LAYER_ID)) addHaloLayer();
            });
        }

        function startPulse() {
            if (haloPulseInterval) return;
            var t = 0;
            haloPulseInterval = setInterval(function () {
                if (!map.getLayer || !map.getLayer(HALO_LAYER_ID)) return;
                t += 0.12;
                var r = 27 + Math.sin(t) * 5;
                var op = 0.25 + (Math.sin(t) + 1) * 0.1;
                try {
                    map.setPaintProperty(HALO_LAYER_ID, 'circle-radius', r);
                    map.setPaintProperty(HALO_LAYER_ID, 'circle-opacity', op);
                } catch (_) { /* style not ready */ }
            }, 60);
        }
        function stopPulse() {
            if (haloPulseInterval) { clearInterval(haloPulseInterval); haloPulseInterval = null; }
        }

        // --- User marker ---------------------------------------------------
        function ensureUserMarker(coords) {
            var lngLat = [coords.longitude, coords.latitude];
            if (userLocationMarker) { userLocationMarker.setLngLat(lngLat); return; }
            var el = document.createElement('div');
            el.className = 'cuub-user-location-marker';
            el.setAttribute('aria-label', 'Your current location');
            userLocationMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat(lngLat)
                .addTo(map);
        }

        // --- Toast ---------------------------------------------------------
        function showToast(message, durationMs) {
            if (!toast) return;
            toast.textContent = message;
            show(toast);
            requestAnimationFrame(function () { toast.classList.add('active'); });
            if (toastTimeoutId) clearTimeout(toastTimeoutId);
            toastTimeoutId = setTimeout(function () {
                toast.classList.remove('active');
                setTimeout(function () { hide(toast); }, 250);
            }, durationMs || 4000);
        }

        // --- Nearest-station info card -------------------------------------
        function showCard(station, distanceMeters) {
            if (!card) return;
            nearestStationObj = station;
            if (cardName) cardName.textContent = station.title || 'CUUB Station';
            if (cardDistance) {
                cardDistance.textContent = (global.CuubGeo && global.CuubGeo.formatDistance)
                    ? global.CuubGeo.formatDistance(distanceMeters)
                    : Math.round(distanceMeters) + ' m';
            }
            if (cardFilled) cardFilled.textContent = station.filled_slots != null ? station.filled_slots : 0;
            if (cardOpen) cardOpen.textContent = station.open_slots != null ? station.open_slots : 0;
            if (cardNote) {
                var isFar = Number.isFinite(distanceMeters) && distanceMeters > FAR_STATION_METERS;
                if (isFar) show(cardNote); else hide(cardNote);
            }
            show(card);
            requestAnimationFrame(function () { card.classList.add('active'); });
        }
        function hideCard() {
            if (!card) return;
            card.classList.remove('active');
            setTimeout(function () { hide(card); }, 250);
        }

        // --- Frame the view (user + nearest station) -----------------------
        function applyUserCoords(coords) {
            if (!coords) return;
            userCoords = coords;
            ensureUserMarker(coords);

            var geo = global.CuubGeo;
            var result = (geo && stations && stations.length > 0)
                ? geo.nearestStation(coords, stations)
                : null;

            if (!result) {
                pendingLocateAfterStations = true;
                map.flyTo({
                    center: [coords.longitude, coords.latitude],
                    zoom: 15.8, speed: 0.9, curve: 1.4, essential: true
                });
                return;
            }

            setHaloStation(result.station);
            startPulse();
            showCard(result.station, result.distanceMeters);

            var stationLng = parseFloat(result.station.longitude);
            var stationLat = parseFloat(result.station.latitude);
            if (Number.isFinite(stationLng) && Number.isFinite(stationLat)) {
                var bounds = new mapboxgl.LngLatBounds();
                bounds.extend([coords.longitude, coords.latitude]);
                bounds.extend([stationLng, stationLat]);

                var viewportWidth = global.innerWidth || 1024;
                var isNarrow = viewportWidth < 480;
                // Leave more top room on sticker pages for the battery modal.
                var topPad = isStickerPage
                    ? (isNarrow ? 320 : 340)
                    : (isNarrow ? 220 : 240);
                var padding = {
                    top: topPad,
                    bottom: isNarrow ? 120 : 140,
                    left: isNarrow ? 40 : 80,
                    right: isNarrow ? 40 : 80
                };
                map.fitBounds(bounds, {
                    padding: padding,
                    maxZoom: 16,
                    duration: 1200,
                    essential: true
                });
            }
        }

        // --- Geolocation ---------------------------------------------------
        function requestLocation() {
            if (!hasGeolocation()) {
                showToast('Location unavailable — showing all stations.');
                safeSessionSet(LOC_SESSION_KEY, 'unavailable');
                return;
            }
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    if (!position || !position.coords) {
                        showToast('Location unavailable — showing all stations.');
                        return;
                    }
                    applyUserCoords({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                function (error) {
                    if (error) console.warn('[CuubNearest] Geolocation error:', error.code, error.message);
                    showToast('Location unavailable — showing all stations.');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        }

        // --- Prompt modal (a11y: dialog, focus trap, ESC) ------------------
        function getModalFocusable() {
            if (!modalEl) return [];
            return Array.prototype.slice.call(modalEl.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ));
        }
        function openModal() {
            if (!backdrop || !modalEl) return;
            lastFocusedBeforeModal = document.activeElement;
            show(backdrop); show(modalEl);
            requestAnimationFrame(function () {
                backdrop.classList.add('active');
                modalEl.classList.add('active');
            });
            if (btnYes) setTimeout(function () { btnYes.focus(); }, 20);

            modalKeyHandler = function (e) {
                if (e.key === 'Escape' || e.key === 'Esc') {
                    e.preventDefault();
                    dismissModal();
                    return;
                }
                if (e.key === 'Tab') {
                    var focusable = getModalFocusable();
                    if (focusable.length === 0) return;
                    var first = focusable[0];
                    var last = focusable[focusable.length - 1];
                    var active = document.activeElement;
                    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
                }
            };
            document.addEventListener('keydown', modalKeyHandler, true);
        }
        function closeModal() {
            if (!backdrop || !modalEl) return;
            backdrop.classList.remove('active');
            modalEl.classList.remove('active');
            setTimeout(function () { hide(backdrop); hide(modalEl); }, 220);
            if (modalKeyHandler) {
                document.removeEventListener('keydown', modalKeyHandler, true);
                modalKeyHandler = null;
            }
            if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
                try { lastFocusedBeforeModal.focus(); } catch (_) { /* noop */ }
            }
            lastFocusedBeforeModal = null;
        }
        function dismissModal() {
            safeSessionSet(LOC_SESSION_KEY, 'dismissed');
            closeModal();
        }

        // --- Wire events ---------------------------------------------------
        if (!hasGeolocation()) {
            if (triggerBtn) hide(triggerBtn);
            setTimeout(function () { showToast('Location unavailable — showing all stations.'); }, 600);
        } else {
            if (triggerBtn) {
                show(triggerBtn);
                triggerBtn.addEventListener('click', openModal);
            }
            if (btnYes) {
                btnYes.addEventListener('click', function () {
                    safeSessionSet(LOC_SESSION_KEY, 'yes');
                    closeModal();
                    requestLocation();
                });
            }
            if (btnNo) {
                btnNo.addEventListener('click', function () {
                    safeSessionSet(LOC_SESSION_KEY, 'no');
                    closeModal();
                });
            }
            if (backdrop) backdrop.addEventListener('click', dismissModal);
            if (cardClose) cardClose.addEventListener('click', hideCard);
            if (cardDirections) {
                cardDirections.addEventListener('click', function () {
                    if (nearestStationObj) openDirectionsTo(nearestStationObj.latitude, nearestStationObj.longitude);
                });
            }

            // Auto-show once per session (unless previously answered/dismissed).
            var prior = safeSessionGet(LOC_SESSION_KEY);
            if (!prior) {
                // Give the page a moment to render first. Extra delay on sticker
                // pages so the battery modal can appear first.
                setTimeout(openModal, isStickerPage ? 900 : 500);
            }
        }

        // --- Public handle -------------------------------------------------
        return {
            // The page calls this once stations are loaded (and optionally again
            // if the list changes). If a location request is waiting for stations,
            // it will complete on the first non-empty call.
            setStations: function (list) {
                stations = Array.isArray(list) ? list : [];
                if (pendingLocateAfterStations && userCoords && stations.length > 0) {
                    pendingLocateAfterStations = false;
                    applyUserCoords(userCoords);
                }
            },
            openPrompt: openModal,
            requestLocation: requestLocation,
            // Expose for pages that want to lift the trigger button with a modal.
            setTriggerButtonBottom: function (px) {
                if (!triggerBtn) return;
                triggerBtn.style.bottom = (typeof px === 'number' ? px + 'px' : px);
            }
        };
    }

    global.CuubNearest = { attach: attach, openDirectionsTo: openDirectionsTo };
})(typeof window !== 'undefined' ? window : globalThis);
