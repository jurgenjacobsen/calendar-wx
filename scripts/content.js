let apiKey; // Replace with your API key
const daysForecast = {}; // Store weather data for caching
let unit = "metric"; // Default unit (metric = Celsius)

chrome.storage.sync.get(["unit"], function (data) {
    if (data.unit) unit = data.unit;
});

async function fetchWeather() {
    chrome.storage.sync.get(["city", "unit", "apiKey", "seaWeather"], async function (data) {
        const city = data.city || ""; // Default city
        const unit = data.unit || "metric"; // Default unit (metric = Celsius)
        const seaWeather = data.seaWeather || false; // Default to false
        apiKey = data.apiKey; // API key

        if (!apiKey) {
            console.error("Please enter an OpenWeatherAPI Key.");
            alert("Please enter an OpenWeatherAPI Key.");
            return;
        }

        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&units=${unit}`;

        try {
            const response = await fetch(url);
            const weatherData = await response.json();

            const dailyData = {};
            let results = weatherData.list;

            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];

            results.forEach((entry) => {
                const date = entry.dt_txt.split(' ')[0]; // Get the date (YYYY-MM-DD)

                // If today’s weather hasn’t been set yet, set it (even if it's not 12:00)
                if (date === today && !dailyData[date]) {
                    dailyData[date] = {
                        ...entry.weather[0],
                        temp: Math.ceil(entry.main.temp_max),
                        wind: entry.wind
                    };
                }

                // Prioritize the 12:00:00 entry if available
                if (entry.dt_txt.includes('12:00:00')) {
                    dailyData[date] = {
                        ...entry.weather[0],
                        temp: Math.ceil(entry.main.temp_max),
                        wind: entry.wind
                    };
                }
            });

            results.forEach((entry) => {
                const date = entry.dt_txt.split(' ')[0]; 

                if(dailyData[date]) {
                    
                    dailyData[date] = {
                        ...dailyData[date],
                        temp: Math.max(dailyData[date]?.temp, Math.ceil(entry.main.temp_max)),
                    };

                }
            });

            Object.assign(daysForecast, dailyData); // Cache weather data
            addWeatherIcons();
        } catch (error) {
            console.error('Error fetching weather:', error);
        }
    });
}

function addWeatherIcons() {
    const days = document.querySelectorAll('.nUt0vb.sVASAd.nSCxEf');

    if (days.length === 0) return;
    if (Object.keys(daysForecast).length === 0) return;

    days.forEach((item) => {
        if (item.querySelector('.weather-icon')) return;
        if (!item.hasAttribute('aria-label')) return;
        
        const date = parseDate(item.getAttribute('aria-label'));

        if (!date) return;

        if (date && daysForecast[date]) {

            let wx = daysForecast[date];

            const weatherIcon = createWeatherIcon(wx, wx?.icon, date);
            
            const weatherTemp = createTempSpan(wx, unit, date);

            item.appendChild(weatherIcon);
            item.appendChild(weatherTemp);
        }
    });
}

function createTempSpan(wx, unit, date) {
    const weatherTemp = document.createElement('span');
    weatherTemp.textContent = `${wx?.temp}°${unit === 'metric' ? 'C' : 'F'}`;
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

    let d = cpw(wx?.description ?? '');
    let w = `${unit == 'metric' ? `${cMtoK(wx?.wind.speed)} km/h` : `${Math.round(wx?.wind.speed)} mph`} ${degToCode(wx?.wind.deg)}`;
    let t = `${d.length > 0 ? `${d} - ${w}` : `${w}`}`
    weatherIcon.title = t;

    weatherIcon.setAttribute('aria-label', date);

    return weatherIcon;
}

function parseDate(dateText) {
    if (!dateText) return null;
    let txt = dateText.replace(', today', '').trim();
    const dateParts = txt.match(/(\d{1,2}) (\w+)/);

    if (!dateParts) return null;

    const day = parseInt(dateParts[1], 10);
    const monthName = dateParts[2];

    const months = {
        "January": 0, "February": 1, "March": 2, "April": 3, "May": 4, "June": 5,
        "July": 6, "August": 7, "September": 8, "October": 9, "November": 10, "December": 11
    };

    if (!(monthName in months)) return null;

    const year = new Date().getFullYear();

    const date = new Date(year, months[monthName], day, 12, 0, 0); // Noon to avoid timezone shifts

    const formattedDate = date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');

    return formattedDate;
}

function cpw(str) {
    return str.replace(/\b\w/g, letter => letter.toUpperCase());
}

function degToCode(degrees) {
    degrees = (degrees % 360 + 360) % 360;
  
    const directions = [
      "N", "NE", "E", "SE", "S", "SW", "W", "NW"
    ];

    const index = Math.round(degrees / 45) % 8;
  
    return directions[index];
  }

function cMtoK(spd) {
    return Math.round(spd * 3.6);
}

const observer = new MutationObserver(() => {
    addWeatherIcons();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

fetchWeather();