"use strict";
let apiKey;
const daysForecast = {};
const daysForecastHourly = {};
let unit = 'metric';
chrome.storage.sync.get(['unit'], (data) => {
    if (data.unit)
        unit = data.unit;
});
async function fetchWeather() {
    chrome.storage.sync.get(['city', 'unit', 'apiKey', 'seaWeather'], async (data) => {
        const city = data.city || '';
        const currentUnit = data.unit || 'metric';
        apiKey = data.apiKey;
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
            Object.assign(daysForecast, dailyData);
            Object.assign(daysForecastHourly, hourlyData);
            addWeatherIcons();
        }
        catch (error) {
            console.error('Error fetching weather:', error);
        }
    });
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
function formatDateHeading(dateStr) {
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
}
function showDetailPopup(date) {
    const existing = document.getElementById('cwx-detail-overlay');
    if (existing)
        existing.remove();
    const hourly = daysForecastHourly[date];
    const daily = daysForecast[date];
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
    popup.style.cssText =
        'background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.25);max-width:420px;width:90%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;font-family:"Google Sans",Roboto,Arial,sans-serif;';
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
    content.style.cssText = 'overflow-y:auto;padding:8px 0;';
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
            const windSpeed = unit === 'metric'
                ? `${convertMsToKmh(entry.wind.speed)} km/h`
                : `${Math.round(entry.wind.speed)} mph`;
            windEl.textContent = `${windSpeed} ${degreesToDirection(entry.wind.deg)}`;
            windEl.style.cssText =
                'font-size:11px;color:#5f6368;min-width:72px;text-align:right;';
            row.appendChild(windEl);
            content.appendChild(row);
        });
    }
    else {
        const noData = document.createElement('div');
        noData.textContent = 'No detailed forecast data available for this day.';
        noData.style.cssText =
            'padding:24px 20px;text-align:center;color:#5f6368;font-size:14px;';
        content.appendChild(noData);
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
