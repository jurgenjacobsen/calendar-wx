document.addEventListener("DOMContentLoaded", function () {
    const cityInput = document.getElementById("city");
    const unitSelect = document.getElementById("unit");
    const saveButton = document.getElementById("save");

    // Load saved preferences when the popup opens
    chrome.storage.sync.get(["city", "unit"], function (data) {
        console.log("Loaded from storage:", data); // Debug log
        if (data.city) cityInput.value = data.city;
        if (data.unit) unitSelect.value = data.unit;
    });

    // Save preferences when the save button is clicked
    saveButton.addEventListener("click", function () {
        const city = cityInput.value.trim();
        const unit = unitSelect.value;

        if (!city) {
            alert("Please enter a city name.");
            return;
        }

        chrome.storage.sync.set({ city, unit }, function () {
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
});

