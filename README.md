# calendar-wx
A browser extension that integrates a weekly weather forecast directly into Google Calendar. Displays temperature, precipitation, and other key weather details for your scheduled events, helping you plan ahead with weather insights. Built for seamless integration and minimal UI interference.

🚀 **Features**:
- [X] Displays a 7-day weather forecast within Google Calendar
- [X] Retrieves location-based weather data for accurate predictions
- [X] Minimalistic design that blends into the Google Calendar interface
- [X] Customizable settings for preferred units (°C/°F, Kmh/Mph, etc.)

📃 **TODO**:
- [ ] Officially publish the extension on Chrome Web Store

🔧 **Tech Stack**: TypeScript, HTML, CSS, OpenWeather API

## Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)

### Setup
```bash
npm install
```

### Build
```bash
npm run build
```

### Watch mode
```bash
npm run watch
```

### Loading the extension
1. Run `npm run build` to compile TypeScript
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder
