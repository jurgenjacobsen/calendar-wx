document.addEventListener("DOMContentLoaded", function () {
    const cityInput = document.getElementById("city");
    const unitSelect = document.getElementById("unit");
    const weatherType = document.getElementById("seaWeather");
    const apiKeyInput = document.getElementById("apiKey");
    const saveButton = document.getElementById("save");
    const findApiKey = document.getElementById("findApiKey");

    // Load saved preferences when the popup opens
    chrome.storage.sync.get(["city", "unit", "apiKey", "seaWeather"], function (data) {
        console.log("Loaded from storage:", data); // Debug log
        if (data.city) cityInput.value = data.city;
        if (data.unit) unitSelect.value = data.unit;
        if (data.apiKey) apiKeyInput.value = data.apiKey;
        if (data.seaWeather) weatherType.checked = data.seaWeather;
    });

    // Save preferences when the save button is clicked
    saveButton.addEventListener("click", function () {
        const city = cityInput.value.trim();
        const unit = unitSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const seaWeather = weatherType.checked;

        if(!apiKey){
            alert("Please enter an OpenWeatherAPI Key.");
            return;
        }

        if (!city) {
            alert("Please enter a city name.");
            return;
        }

        chrome.storage.sync.set({ city, unit, apiKey, seaWeather }, function () {
            if (chrome.runtime.lastError) {
                console.error("Error saving settings:", chrome.runtime.lastError);
                return;
            }
            
            alert("Settings saved!");           
            
            // This will refresh the current tab when the settings are saved
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length === 0) return;
                if(!tabs[0].url.includes('calendar.google.com')) return;
                chrome.tabs.reload(tabs[0].id);
            });
        });
    });

    // Find API key link
    findApiKey.addEventListener("click", function () {
        chrome.tabs.create({ url: "https://home.openweathermap.org/api_keys" });
    });
});

