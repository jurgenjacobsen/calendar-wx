let apiKey; // Replace with your API key
const daysForecast = {}; // Store weather data for caching
let unit = "metric"; // Default unit (metric = Celsius)

chrome.storage.sync.get(["unit"], function (data) {
    if (data.unit) unit = data.unit;
});

async function fetchWeather() {
    chrome.storage.sync.get(["city", "unit", "apiKey"], async function (data) {
        const city = data.city || "Porto"; // Default city
        const unit = data.unit || "metric"; // Default unit (metric = Celsius)
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
            weatherData.list.forEach((entry) => {
                const date = entry.dt_txt.split(' ')[0]; // Get the date (YYYY-MM-DD)
                if (!dailyData[date]) {
                    dailyData[date] = {
                        ...entry.weather[0],
                        temp: Math.round(entry.main.temp_max)
                    };
                }
            });

            Object.assign(daysForecast, dailyData); // Cache weather data
            addWeatherIcons(unit);

        } catch (error) {
            console.error('Error fetching weather:', error);
        }
    });
}

function addWeatherIcons() {
    const days = document.querySelectorAll('.nUt0vb.sVASAd.nSCxEf');

    days.forEach((item) => {
        const dateText = item.getAttribute('aria-label');
        const formattedDate = formatDate(dateText);

        if (formattedDate && daysForecast[formattedDate] && !item.querySelector('.weather-icon')) {
            const weatherIcon = document.createElement('img');
            weatherIcon.src = `https://openweathermap.org/img/wn/${daysForecast[formattedDate]?.icon}@2x.png`;
            weatherIcon.classList.add('weather-icon');
            weatherIcon.style.width = '42px';
            weatherIcon.style.height = '42px';
            weatherIcon.style.position = 'absolute';
            weatherIcon.style.left = '48px';
            weatherIcon.title = cpw(daysForecast[formattedDate]?.description ?? '');

            const weatherTemp = document.createElement('span');
            weatherTemp.textContent = `${daysForecast[formattedDate]?.temp}°${unit === 'metric' ? 'C' : 'F'}`;
            weatherTemp.style.position = 'absolute';
            weatherTemp.style.right = '56px';
            weatherTemp.style.top = '50%';
            weatherTemp.style.transform = 'translateY(-50%)';
            weatherTemp.style.fontSize = '14px';
            weatherTemp.style.fontWeight = 'bold';

            item.appendChild(weatherIcon);
            item.appendChild(weatherTemp);
        }
    });
}

function formatDate(dateText) {
    const date = new Date(dateText);
    if (isNaN(date)) return null; // Return null if date is invalid
    return date.toISOString().split('T')[0]?.replace('2001', new Date().getFullYear()); // Extract YYYY-MM-DD
}

function cpw(str) {
    return str.replace(/\b\w/g, letter => letter.toUpperCase());
  }

const observer = new MutationObserver(() => {
    addWeatherIcons();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

fetchWeather();