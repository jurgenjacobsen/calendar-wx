"use strict";
document.addEventListener('DOMContentLoaded', () => {
    const cityInput = document.getElementById('city');
    const unitSelect = document.getElementById('unit');
    const weatherType = document.getElementById('seaWeather');
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('save');
    const findApiKey = document.getElementById('findApiKey');
    const statusMessage = document.getElementById('statusMessage');
    // Load saved preferences when the popup opens
    chrome.storage.sync.get(['city', 'unit', 'apiKey', 'seaWeather'], (data) => {
        if (data.city)
            cityInput.value = data.city;
        if (data.unit)
            unitSelect.value = data.unit;
        if (data.apiKey)
            apiKeyInput.value = data.apiKey;
        if (data.seaWeather)
            weatherType.checked = data.seaWeather;
    });
    function showStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${isError ? 'error' : 'success'}`;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
    // Save preferences when the save button is clicked
    saveButton.addEventListener('click', () => {
        const city = cityInput.value.trim();
        const unit = unitSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const seaWeather = weatherType.checked;
        if (!apiKey) {
            showStatus('Please enter an OpenWeatherAPI Key.', true);
            return;
        }
        if (!city) {
            showStatus('Please enter a city name.', true);
            return;
        }
        chrome.storage.sync.set({ city, unit, apiKey, seaWeather }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving settings:', chrome.runtime.lastError);
                showStatus('Error saving settings.', true);
                return;
            }
            showStatus('Settings saved!');
            // This will refresh the current tab when the settings are saved
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length === 0)
                    return;
                if (!tabs[0].url?.includes('calendar.google.com'))
                    return;
                if (tabs[0].id)
                    chrome.tabs.reload(tabs[0].id);
            });
        });
    });
    // Find API key link
    findApiKey.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://home.openweathermap.org/api_keys' });
    });
});
