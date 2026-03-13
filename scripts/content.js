"use strict";
let apiKey;
const daysForecast = {};
const daysForecastHourly = {};
const daysForecastTides = {};
const daysForecastTideSeries = {};
const daysForecastWaveSeries = {};
const cityCoordinatesCache = {};
let seaWeatherEnabled = false;
let seaPanelCollapsed = false;
let unit = 'metric';
chrome.storage.sync.get(['unit', 'seaPanelCollapsed'], (data) => {
    if (data.unit)
        unit = data.unit;
    if (typeof data.seaPanelCollapsed === 'boolean') {
        seaPanelCollapsed = data.seaPanelCollapsed;
    }
});
async function fetchWeather() {
    chrome.storage.sync.get(['city', 'unit', 'apiKey', 'seaWeather'], async (data) => {
        const city = data.city || '';
        const currentUnit = data.unit || 'metric';
        apiKey = data.apiKey;
        seaWeatherEnabled = Boolean(data.seaWeather);
        if (!apiKey) {
            console.error('Please enter an OpenWeatherAPI Key.');
            alert('Please enter an OpenWeatherAPI Key.');
            return;
        }
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&units=${currentUnit}`;
        try {
            const response = await fetch(url);
            const weatherData = await response.json();
            const dailyData = {};
            const results = weatherData.list;
            if (!Array.isArray(results) || results.length === 0) {
                console.error('No weather forecast data returned.');
                return;
            }
            const today = new Date().toISOString().split('T')[0];
            results.forEach((entry) => {
                const date = entry.dt_txt.split(' ')[0];
                if (date === today && !dailyData[date]) {
                    dailyData[date] = {
                        ...entry.weather[0],
                        temp: Math.ceil(entry.main.temp_max),
                        wind: entry.wind,
                    };
                }
                if (entry.dt_txt.includes('12:00:00')) {
                    dailyData[date] = {
                        ...entry.weather[0],
                        temp: Math.ceil(entry.main.temp_max),
                        wind: entry.wind,
                    };
                }
            });
            results.forEach((entry) => {
                const date = entry.dt_txt.split(' ')[0];
                if (dailyData[date]) {
                    dailyData[date] = {
                        ...dailyData[date],
                        temp: Math.max(dailyData[date]?.temp, Math.ceil(entry.main.temp_max)),
                    };
                }
            });
            const hourlyData = {};
            results.forEach((entry) => {
                const date = entry.dt_txt.split(' ')[0];
                const time = entry.dt_txt.split(' ')[1].substring(0, 5);
                if (!hourlyData[date])
                    hourlyData[date] = [];
                hourlyData[date].push({
                    time,
                    description: entry.weather[0].description,
                    icon: entry.weather[0].icon,
                    temp: Math.ceil(entry.main.temp),
                    humidity: entry.main.humidity,
                    wind: entry.wind,
                });
            });
            const tideData = {};
            const tideSeriesData = {};
            const waveSeriesData = {};
            if (seaWeatherEnabled && apiKey) {
                try {
                    const coords = await geocodeCity(city, apiKey);
                    if (coords) {
                        const startDate = results[0]?.dt_txt.split(' ')[0];
                        const endDate = results[results.length - 1]?.dt_txt.split(' ')[0];
                        if (startDate && endDate) {
                            const tideResult = await fetchTideEventsForRange(coords, startDate, endDate);
                            Object.assign(tideData, groupTideEventsByDate(tideResult.events));
                            Object.assign(tideSeriesData, tideResult.seriesByDate);
                            Object.assign(waveSeriesData, tideResult.waveSeriesByDate);
                        }
                    }
                    else {
                        console.warn('No coordinates available for marine data lookup.');
                    }
                }
                catch (error) {
                    console.warn('Unable to fetch marine tide data:', error);
                }
            }
            replaceRecord(daysForecast, dailyData);
            replaceRecord(daysForecastHourly, hourlyData);
            replaceRecord(daysForecastTides, tideData);
            replaceRecord(daysForecastTideSeries, tideSeriesData);
            replaceRecord(daysForecastWaveSeries, waveSeriesData);
            addWeatherIcons();
        }
        catch (error) {
            console.error('Error fetching weather:', error);
        }
    });
}
function replaceRecord(target, source) {
    Object.keys(target).forEach((key) => {
        delete target[key];
    });
    Object.assign(target, source);
}
async function geocodeCity(city, weatherApiKey) {
    const cacheKey = city.trim().toLowerCase();
    if (!cacheKey)
        return null;
    if (cityCoordinatesCache[cacheKey])
        return cityCoordinatesCache[cacheKey];
    const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct` +
        `?q=${encodeURIComponent(city)}&limit=1&appid=${weatherApiKey}`;
    const response = await fetch(geocodeUrl);
    if (!response.ok) {
        throw new Error(`Geocoding failed with status ${response.status}`);
    }
    const geocodeResults = (await response.json());
    if (!Array.isArray(geocodeResults) || geocodeResults.length === 0)
        return null;
    const coords = {
        lat: geocodeResults[0].lat,
        lon: geocodeResults[0].lon,
    };
    cityCoordinatesCache[cacheKey] = coords;
    return coords;
}
async function fetchTideEventsForRange(coordinates, startDate, endDate) {
    const url = `https://marine-api.open-meteo.com/v1/marine` +
        `?latitude=${coordinates.lat}` +
        `&longitude=${coordinates.lon}` +
        `&hourly=sea_level_height_msl,wave_height,wave_direction` +
        `&cell_selection=sea` +
        `&timezone=auto` +
        `&start_date=${startDate}` +
        `&end_date=${endDate}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Marine API failed with status ${response.status}`);
    }
    const marineData = (await response.json());
    const times = marineData.hourly?.time ?? [];
    const heights = marineData.hourly?.sea_level_height_msl ?? [];
    const waveHeights = marineData.hourly?.wave_height ?? [];
    const waveDirections = marineData.hourly?.wave_direction ?? [];
    if (times.length < 3 || heights.length < 3 || times.length !== heights.length) {
        return { events: [], seriesByDate: {}, waveSeriesByDate: {} };
    }
    const tideEvents = [];
    const seriesByDate = {};
    const waveSeriesByDate = {};
    for (let i = 0; i < heights.length; i += 1) {
        const height = heights[i];
        if (Number.isNaN(height))
            continue;
        const [date, timePart = '00:00'] = times[i].split('T');
        if (!seriesByDate[date])
            seriesByDate[date] = [];
        seriesByDate[date].push({
            date,
            time: timePart.slice(0, 5),
            height: Math.round(height * 100) / 100,
        });
    }
    for (let i = 0; i < waveHeights.length; i += 1) {
        const waveHeight = waveHeights[i];
        if (Number.isNaN(waveHeight))
            continue;
        const timestamp = times[i];
        if (!timestamp)
            continue;
        const [date, timePart = '00:00'] = timestamp.split('T');
        if (!waveSeriesByDate[date])
            waveSeriesByDate[date] = [];
        const waveDirection = waveDirections[i];
        waveSeriesByDate[date].push({
            date,
            time: timePart.slice(0, 5),
            height: Math.round(waveHeight * 100) / 100,
            direction: Number.isNaN(waveDirection) ? undefined : waveDirection,
        });
    }
    // Extract likely high/low tide points from local extrema in hourly series.
    for (let i = 1; i < heights.length - 1; i += 1) {
        const previous = heights[i - 1];
        const current = heights[i];
        const next = heights[i + 1];
        if (Number.isNaN(previous) ||
            Number.isNaN(current) ||
            Number.isNaN(next)) {
            continue;
        }
        let type = null;
        if (current > previous && current >= next)
            type = 'high';
        if (current < previous && current <= next)
            type = 'low';
        if (!type)
            continue;
        const [date, timePart = '00:00'] = times[i].split('T');
        tideEvents.push({
            date,
            time: timePart.slice(0, 5),
            type,
            height: Math.round(current * 100) / 100,
        });
    }
    return { events: tideEvents, seriesByDate, waveSeriesByDate };
}
function groupTideEventsByDate(events) {
    const grouped = {};
    events.forEach((event) => {
        if (!grouped[event.date])
            grouped[event.date] = [];
        grouped[event.date].push(event);
    });
    return grouped;
}
function addWeatherIcons() {
    const days = document.querySelectorAll('.nUt0vb.sVASAd.nSCxEf');
    if (days.length === 0)
        return;
    if (Object.keys(daysForecast).length === 0)
        return;
    days.forEach((item) => {
        if (item.querySelector('.weather-icon'))
            return;
        if (!item.hasAttribute('aria-label'))
            return;
        const date = parseDate(item.getAttribute('aria-label'));
        if (!date)
            return;
        if (date && daysForecast[date]) {
            const wx = daysForecast[date];
            const weatherIcon = createWeatherIcon(wx, wx?.icon, date);
            const weatherTemp = createTempSpan(wx, unit, date);
            item.appendChild(weatherIcon);
            item.appendChild(weatherTemp);
        }
    });
}
function createTempSpan(wx, currentUnit, date) {
    const weatherTemp = document.createElement('span');
    weatherTemp.textContent = `${wx?.temp}°${currentUnit === 'metric' ? 'C' : 'F'}`;
    weatherTemp.style.position = 'absolute';
    weatherTemp.style.right = '56px';
    weatherTemp.style.top = '50%';
    weatherTemp.style.transform = 'translateY(-50%)';
    weatherTemp.style.fontSize = '14px';
    weatherTemp.style.fontWeight = 'bold';
    weatherTemp.style.color = '#E3E3E3';
    weatherTemp.setAttribute('aria-label', date);
    return weatherTemp;
}
function createWeatherIcon(wx, icon, date) {
    const weatherIcon = document.createElement('img');
    weatherIcon.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    weatherIcon.classList.add('weather-icon');
    weatherIcon.style.width = '42px';
    weatherIcon.style.height = '42px';
    weatherIcon.style.position = 'absolute';
    weatherIcon.style.left = '48px';
    const d = capitalizeWords(wx?.description ?? '');
    const w = `${unit == 'metric' ? `${convertMsToKmh(wx?.wind.speed)} km/h` : `${Math.round(wx?.wind.speed)} mph`} ${degreesToDirection(wx?.wind.deg)}`;
    const t = `${d.length > 0 ? `${d} - ${w}` : `${w}`}`;
    weatherIcon.title = t;
    weatherIcon.setAttribute('aria-label', date);
    weatherIcon.style.cursor = 'pointer';
    weatherIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showDetailPopup(date);
    });
    return weatherIcon;
}
function parseDate(dateText) {
    if (!dateText)
        return null;
    const txt = dateText.replace(', today', '').trim();
    const dateParts = txt.match(/(\d{1,2}) (\w+)/);
    if (!dateParts)
        return null;
    const day = parseInt(dateParts[1], 10);
    const monthName = dateParts[2];
    const months = {
        January: 0,
        February: 1,
        March: 2,
        April: 3,
        May: 4,
        June: 5,
        July: 6,
        August: 7,
        September: 8,
        October: 9,
        November: 10,
        December: 11,
    };
    if (!(monthName in months))
        return null;
    const year = new Date().getFullYear();
    const date = new Date(year, months[monthName], day, 12, 0, 0);
    const formattedDate = date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getDate()).padStart(2, '0');
    return formattedDate;
}
function capitalizeWords(str) {
    return str.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function degreesToDirection(degrees) {
    degrees = ((degrees % 360) + 360) % 360;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}
function convertMsToKmh(spd) {
    return Math.round(spd * 3.6);
}
function formatWindSpeedForUnit(speed, currentUnit) {
    return currentUnit === 'metric'
        ? `${convertMsToKmh(speed)} km/h`
        : `${Math.round(speed)} mph`;
}
function formatDateHeading(dateStr) {
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
}
function createTideGraphElement(points, events) {
    const graphWrap = document.createElement('div');
    graphWrap.style.cssText = 'margin-top:8px;width:100%;';
    const title = document.createElement('div');
    title.textContent = 'Tide Through The Day';
    title.style.cssText =
        'font-size:11px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;';
    graphWrap.appendChild(title);
    const width = 280;
    const height = 162;
    const chartLeft = 34;
    const chartRight = width - 8;
    const chartTop = 12;
    const chartBottom = 108;
    const usableWidth = chartRight - chartLeft;
    const usableHeight = chartBottom - chartTop;
    let minHeight = Math.min(...points.map((point) => point.height));
    let maxHeight = Math.max(...points.map((point) => point.height));
    if (minHeight === maxHeight) {
        minHeight -= 0.1;
        maxHeight += 0.1;
    }
    const xAt = (idx) => chartLeft + (idx / Math.max(points.length - 1, 1)) * usableWidth;
    const yAt = (value) => {
        const ratio = (value - minHeight) / (maxHeight - minHeight);
        return chartTop + (1 - ratio) * usableHeight;
    };
    const drawPoints = points.map((point, idx) => ({
        x: xAt(idx),
        y: yAt(point.height),
    }));
    let pathData = '';
    if (drawPoints.length > 0) {
        pathData = `M ${drawPoints[0].x.toFixed(2)} ${drawPoints[0].y.toFixed(2)}`;
        for (let i = 1; i < drawPoints.length; i += 1) {
            const prev = drawPoints[i - 1];
            const curr = drawPoints[i];
            const controlX = prev.x + (curr.x - prev.x) / 2;
            pathData +=
                ` C ${controlX.toFixed(2)} ${prev.y.toFixed(2)}` +
                    ` ${controlX.toFixed(2)} ${curr.y.toFixed(2)}` +
                    ` ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
        }
    }
    const areaPath = pathData
        ? `${pathData} L ${chartRight.toFixed(2)} ${chartBottom.toFixed(2)} L ${chartLeft.toFixed(2)} ${chartBottom.toFixed(2)} Z`
        : '';
    const findClosestIndexForHour = (hour) => {
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        points.forEach((point, idx) => {
            const pointHour = parseInt(point.time.slice(0, 2), 10);
            if (Number.isNaN(pointHour))
                return;
            const distance = Math.abs(pointHour - hour);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = idx;
            }
        });
        return bestIndex;
    };
    const tickConfig = [
        { label: '00:00', idx: findClosestIndexForHour(0) },
        { label: '12:00', idx: findClosestIndexForHour(12) },
        { label: '23:00', idx: Math.max(points.length - 1, 0) },
    ];
    const horizontalGrid = [0, 0.33, 0.66, 1]
        .map((ratio) => {
        const y = chartTop + ratio * usableHeight;
        return `<line x1="${chartLeft}" y1="${y.toFixed(2)}" x2="${chartRight.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#e6ebf2" stroke-width="1" />`;
    })
        .join('');
    const verticalGrid = tickConfig
        .map((tick) => {
        const x = xAt(tick.idx);
        return `<line x1="${x.toFixed(2)}" y1="${chartTop}" x2="${x.toFixed(2)}" y2="${chartBottom}" stroke="#edf1f5" stroke-width="1" />`;
    })
        .join('');
    const yAxisLabels = [
        { value: maxHeight, y: chartTop },
        { value: (maxHeight + minHeight) / 2, y: chartTop + usableHeight / 2 },
        { value: minHeight, y: chartBottom },
    ]
        .map((label) => `<text x="${(chartLeft - 6).toFixed(2)}" y="${(label.y + 3).toFixed(2)}" text-anchor="end" font-size="10" fill="#6f7782">${label.value.toFixed(2)} m</text>`)
        .join('');
    const xAxisLabels = tickConfig
        .map((tick) => {
        const x = xAt(tick.idx);
        return `<text x="${x.toFixed(2)}" y="${(chartBottom + 16).toFixed(2)}" text-anchor="middle" font-size="10" fill="#6f7782">${tick.label}</text>`;
    })
        .join('');
    const eventMarkers = events
        .slice(0, 8)
        .map((event) => {
        const idx = points.findIndex((point) => point.time === event.time);
        if (idx < 0)
            return '';
        const fill = event.type === 'high' ? '#1a73e8' : '#34a853';
        return `<circle cx="${xAt(idx).toFixed(2)}" cy="${yAt(event.height).toFixed(2)}" r="2.8" fill="${fill}" />`;
    })
        .join('');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '162');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Sea level tide chart');
    svg.innerHTML =
        horizontalGrid +
            verticalGrid +
            `<path d="${areaPath}" fill="#dce8ff" opacity="0.55" />` +
            `<line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="#d4dbe4" stroke-width="1" />` +
            `<line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom}" stroke="#d4dbe4" stroke-width="1" />` +
            `<path d="${pathData}" fill="none" stroke="#0b57d0" stroke-width="2.4" stroke-linecap="round" />` +
            eventMarkers +
            yAxisLabels +
            xAxisLabels;
    const scale = document.createElement('div');
    scale.style.cssText =
        'display:flex;justify-content:space-between;font-size:11px;color:#5f6368;margin-top:4px;';
    scale.innerHTML =
        `<span>${minHeight.toFixed(2)} m</span>` +
            `<span>Sea level range</span>` +
            `<span>${maxHeight.toFixed(2)} m</span>`;
    const legend = document.createElement('div');
    legend.style.cssText =
        'display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:8px;font-size:11px;color:#5f6368;';
    legend.innerHTML =
        `<span title="Predicted sea-level curve for the selected day" style="display:inline-flex;align-items:center;gap:6px;cursor:help;">` +
            `<span style="width:14px;height:2px;background:#0b57d0;border-radius:2px;"></span>Sea level` +
            `</span>` +
            `<span title="Expected local maxima from hourly sea-level values" style="display:inline-flex;align-items:center;gap:6px;cursor:help;">` +
            `<span style="width:8px;height:8px;background:#1a73e8;border-radius:50%;"></span>High tide` +
            `</span>` +
            `<span title="Expected local minima from hourly sea-level values" style="display:inline-flex;align-items:center;gap:6px;cursor:help;">` +
            `<span style="width:8px;height:8px;background:#34a853;border-radius:50%;"></span>Low tide` +
            `</span>`;
    const eventsList = document.createElement('div');
    eventsList.style.cssText =
        'margin-top:8px;display:flex;flex-direction:column;gap:4px;font-size:11px;color:#5f6368;';
    if (events.length > 0) {
        const orderedEvents = [...events].sort((a, b) => a.time.localeCompare(b.time));
        orderedEvents.forEach((event) => {
            const eventRow = document.createElement('div');
            const eventLabel = event.type === 'high' ? 'High' : 'Low';
            eventRow.textContent = `${eventLabel}: ${event.time} (${event.height.toFixed(2)} m)`;
            eventsList.appendChild(eventRow);
        });
    }
    graphWrap.appendChild(svg);
    graphWrap.appendChild(scale);
    graphWrap.appendChild(legend);
    if (events.length > 0) {
        graphWrap.appendChild(eventsList);
    }
    return graphWrap;
}
function createWaveTimelineElement(entries) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
        'margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;';
    const title = document.createElement('div');
    title.textContent = 'Waves Through The Day';
    title.style.cssText =
        'font-size:11px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:0.3px;';
    wrap.appendChild(title);
    const list = document.createElement('div');
    list.style.cssText =
        'margin-top:6px;display:flex;flex-direction:column;gap:4px;max-height:152px;overflow-y:auto;padding-right:2px;';
    entries.forEach((entry) => {
        const row = document.createElement('div');
        row.style.cssText =
            'display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#5f6368;gap:8px;';
        const time = document.createElement('span');
        time.textContent = entry.time;
        time.style.cssText = 'font-weight:600;color:#3c4043;min-width:38px;';
        const details = document.createElement('span');
        const directionText = typeof entry.direction === 'number'
            ? ` ${degreesToDirection(entry.direction)}`
            : '';
        details.textContent = `${entry.height.toFixed(2)} m${directionText}`;
        details.style.cssText = 'text-align:right;';
        row.appendChild(time);
        row.appendChild(details);
        list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
}
function hasNonZeroNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}
function hasSeaWeatherData(tideSeries, tideEvents, waveSeries) {
    const tideSeriesHasData = tideSeries.some((point) => hasNonZeroNumber(point.height));
    const tideEventsHaveData = tideEvents.some((event) => hasNonZeroNumber(event.height));
    const waveSeriesHasData = waveSeries.some((point) => hasNonZeroNumber(point.height) || hasNonZeroNumber(point.direction));
    return tideSeriesHasData || tideEventsHaveData || waveSeriesHasData;
}
function showDetailPopup(date) {
    const existing = document.getElementById('cwx-detail-overlay');
    if (existing)
        existing.remove();
    const hourly = daysForecastHourly[date];
    const daily = daysForecast[date];
    const tides = daysForecastTides[date] ?? [];
    const tideSeries = daysForecastTideSeries[date] ?? [];
    const waveSeries = daysForecastWaveSeries[date] ?? [];
    const seaDataAvailable = hasSeaWeatherData(tideSeries, tides, waveSeries);
    if (!hourly && !daily)
        return;
    const overlay = document.createElement('div');
    overlay.id = 'cwx-detail-overlay';
    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            overlay.remove();
    });
    const popup = document.createElement('div');
    const popupMaxWidth = seaWeatherEnabled && !seaPanelCollapsed ? '760px' : '420px';
    popup.style.cssText =
        `background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.25);max-width:${popupMaxWidth};width:95%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;font-family:"Google Sans",Roboto,Arial,sans-serif;transition:max-width 0.28s ease;`;
    // Header
    const header = document.createElement('div');
    header.style.cssText =
        'background:linear-gradient(135deg,#4285f4,#34a853);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    const headerLeft = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = formatDateHeading(date);
    title.style.cssText = 'font-size:16px;font-weight:600;';
    headerLeft.appendChild(title);
    if (daily) {
        const subtitle = document.createElement('div');
        subtitle.textContent = `${capitalizeWords(daily.description)} · ${daily.temp}°${unit === 'metric' ? 'C' : 'F'}`;
        subtitle.style.cssText = 'font-size:12px;opacity:0.9;margin-top:2px;';
        headerLeft.appendChild(subtitle);
    }
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText =
        'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:4px 8px;line-height:1;opacity:0.8;';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(headerLeft);
    header.appendChild(closeBtn);
    popup.appendChild(header);
    // Content
    const content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;padding:0;';
    let weatherContent = content;
    if (seaWeatherEnabled) {
        const twoColumnLayout = document.createElement('div');
        twoColumnLayout.style.cssText =
            'display:flex;align-items:stretch;gap:0;min-height:100%;position:relative;';
        const weatherColumn = document.createElement('div');
        weatherColumn.style.cssText = 'flex:1;min-width:0;';
        const dividerColumn = document.createElement('div');
        dividerColumn.style.cssText =
            'width:18px;flex:0 0 18px;position:relative;background:#fff;border-right:1px solid #edf1f5;';
        const panelToggle = document.createElement('button');
        panelToggle.type = 'button';
        panelToggle.style.cssText =
            'position:absolute;left:50%;top:50%;transform:translate(-50%, -50%);width:20px;height:48px;border:1px solid #c8d2df;border-radius:12px;background:linear-gradient(180deg,#ffffff 0%,#f3f7fb 100%);color:#3c4043;font-size:12px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 2px 6px rgba(26,115,232,0.14);transition:transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;';
        panelToggle.setAttribute('aria-label', 'Toggle sea weather panel');
        panelToggle.addEventListener('mouseenter', () => {
            panelToggle.style.boxShadow = '0 4px 10px rgba(26,115,232,0.24)';
            panelToggle.style.background =
                'linear-gradient(180deg,#ffffff 0%,#eaf2ff 100%)';
        });
        panelToggle.addEventListener('mouseleave', () => {
            panelToggle.style.boxShadow = '0 2px 6px rgba(26,115,232,0.14)';
            panelToggle.style.background =
                'linear-gradient(180deg,#ffffff 0%,#f3f7fb 100%)';
        });
        panelToggle.addEventListener('focus', () => {
            panelToggle.style.boxShadow = '0 0 0 2px rgba(26,115,232,0.25)';
        });
        panelToggle.addEventListener('blur', () => {
            panelToggle.style.boxShadow = '0 2px 6px rgba(26,115,232,0.14)';
        });
        const seaColumn = document.createElement('div');
        seaColumn.style.cssText =
            'width:300px;flex:0 0 300px;background:#f8fafc;padding:10px 12px 12px;display:flex;flex-direction:column;opacity:1;transition:opacity 0.2s ease;';
        const tidesTitle = document.createElement('div');
        tidesTitle.textContent = 'Sea Weather';
        tidesTitle.style.cssText =
            'font-size:12px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:0.4px;';
        seaColumn.appendChild(tidesTitle);
        const tidesProvider = document.createElement('div');
        tidesProvider.textContent = 'Provided by Open-Meteo Marine API';
        tidesProvider.style.cssText =
            'font-size:10px;color:#5f6368;margin-top:2px;letter-spacing:0.2px;';
        seaColumn.appendChild(tidesProvider);
        if (!seaDataAvailable) {
            const noSeaWeatherWrap = document.createElement('div');
            noSeaWeatherWrap.style.cssText =
                'flex:1;display:flex;align-items:center;justify-content:center;text-align:center;';
            const noSeaWeather = document.createElement('div');
            noSeaWeather.textContent = 'No Sea Weather available';
            noSeaWeather.style.cssText = 'font-size:12px;color:#5f6368;';
            noSeaWeatherWrap.appendChild(noSeaWeather);
            seaColumn.appendChild(noSeaWeatherWrap);
        }
        else {
            if (tideSeries.length > 1) {
                seaColumn.appendChild(createTideGraphElement(tideSeries, tides));
            }
            if (waveSeries.length > 0) {
                seaColumn.appendChild(createWaveTimelineElement(waveSeries));
            }
        }
        const applySeaPanelState = (collapsed) => {
            seaPanelCollapsed = collapsed;
            panelToggle.textContent = '❯';
            panelToggle.title = collapsed
                ? 'Expand sea weather panel'
                : 'Collapse sea weather panel';
            panelToggle.setAttribute('aria-expanded', String(!collapsed));
            if (collapsed) {
                panelToggle.style.transform = 'translate(-50%, -50%) rotate(0deg)';
                seaColumn.style.opacity = '0';
                seaColumn.style.display = 'none';
                dividerColumn.style.borderRight = 'none';
                weatherColumn.style.borderRight = 'none';
                popup.style.maxWidth = '420px';
            }
            else {
                panelToggle.style.transform = 'translate(-50%, -50%) rotate(180deg)';
                seaColumn.style.display = 'flex';
                requestAnimationFrame(() => {
                    seaColumn.style.opacity = '1';
                });
                dividerColumn.style.borderRight = '1px solid #edf1f5';
                weatherColumn.style.borderRight = '1px solid #edf1f5';
                popup.style.maxWidth = '760px';
            }
        };
        panelToggle.addEventListener('click', () => {
            const nextCollapsed = !seaPanelCollapsed;
            applySeaPanelState(nextCollapsed);
            chrome.storage.sync.set({ seaPanelCollapsed: nextCollapsed });
        });
        applySeaPanelState(seaPanelCollapsed);
        dividerColumn.appendChild(panelToggle);
        twoColumnLayout.appendChild(weatherColumn);
        twoColumnLayout.appendChild(dividerColumn);
        twoColumnLayout.appendChild(seaColumn);
        content.appendChild(twoColumnLayout);
        weatherContent = weatherColumn;
    }
    if (hourly && hourly.length > 0) {
        hourly.forEach((entry, i) => {
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex;align-items:center;padding:10px 20px;gap:12px;' +
                    (i < hourly.length - 1 ? 'border-bottom:1px solid #f0f0f0;' : '');
            // Time
            const timeEl = document.createElement('div');
            timeEl.textContent = entry.time;
            timeEl.style.cssText =
                'font-size:14px;font-weight:600;color:#202124;min-width:44px;';
            row.appendChild(timeEl);
            // Icon
            const iconEl = document.createElement('img');
            iconEl.src = `https://openweathermap.org/img/wn/${entry.icon}@2x.png`;
            iconEl.style.cssText = 'width:36px;height:36px;flex-shrink:0;';
            row.appendChild(iconEl);
            // Description + humidity
            const descCol = document.createElement('div');
            descCol.style.cssText = 'flex:1;min-width:0;';
            const descEl = document.createElement('div');
            descEl.textContent = capitalizeWords(entry.description);
            descEl.style.cssText =
                'font-size:13px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            const humEl = document.createElement('div');
            humEl.textContent = `Humidity: ${entry.humidity}%`;
            humEl.style.cssText = 'font-size:11px;color:#5f6368;margin-top:1px;';
            descCol.appendChild(descEl);
            descCol.appendChild(humEl);
            row.appendChild(descCol);
            // Temp
            const tempEl = document.createElement('div');
            tempEl.textContent = `${entry.temp}°${unit === 'metric' ? 'C' : 'F'}`;
            tempEl.style.cssText =
                'font-size:15px;font-weight:600;color:#202124;min-width:42px;text-align:right;';
            row.appendChild(tempEl);
            // Wind
            const windEl = document.createElement('div');
            windEl.textContent = `${formatWindSpeedForUnit(entry.wind.speed, unit)} ${degreesToDirection(entry.wind.deg)}`;
            windEl.style.cssText =
                'font-size:11px;color:#5f6368;min-width:72px;text-align:right;';
            row.appendChild(windEl);
            weatherContent.appendChild(row);
        });
    }
    else {
        const noData = document.createElement('div');
        noData.textContent = 'No detailed forecast data available for this day.';
        noData.style.cssText =
            'padding:24px 20px;text-align:center;color:#5f6368;font-size:14px;';
        weatherContent.appendChild(noData);
    }
    popup.appendChild(content);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}
const observer = new MutationObserver(() => {
    addWeatherIcons();
});
observer.observe(document.body, {
    childList: true,
    subtree: true,
});
fetchWeather();
