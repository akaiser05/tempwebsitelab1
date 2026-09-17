const unitToggle = document.querySelector('#unit-toggle');
const sensorToggle = document.querySelector('#sensor-toggle');
const selectedSensor = document.querySelector('#selected-sensor');
const currentTemperature = document.querySelector('#current-temperature');
const notificationForm = document.querySelector('#notification-form');
const notificationsEnabled = document.querySelector('#notifications-enabled');
const notificationContact = document.querySelector('#notification-contact');
const maximumTemperature = document.querySelector('#maximum-temperature');
const minimumTemperature = document.querySelector('#minimum-temperature');
const highMessage = document.querySelector('#high-message');
const lowMessage = document.querySelector('#low-message');
const notificationStatus = document.querySelector('#notification-status');
const sensorPanels = [
    document.querySelector('#sensor-panel-1'),
    document.querySelector('#sensor-panel-2')
];
const onOffToggle = document.querySelector('#on-off-toggle');
const emailJsPublicKey = 'IA9jwjIDwLvYZmb_4';
const emailJsServiceId = 'service_fjgljvm';
const emailJsTemplateId = 'template_t84jn0b';

const chartLeft = 70;
const chartTop = 20;
const chartWidth = 800;
const chartHeight = 320;
const minimumValue = 10;
const maximumValue = 50;
const maximumSeconds = 300;
const maximumReadings = 300;
const sensor1Readings = [];
const sensor2Readings = [];
const alertStates = new Map();
const notificationsStateStorageKey = 'notificationsEnabled';
const databaseSignalEndpoint = '/api/device-command';

let isFahrenheit = false;
let visibleSensor = 1;

emailjs.init({ publicKey: emailJsPublicKey });

function getNotificationsEnabled() {
    return localStorage.getItem(notificationsStateStorageKey) === 'true';
}

function updateDeviceStateUI(isOn) {
    const value = String(isOn);
    onOffToggle.setAttribute('aria-pressed', value);
    onOffToggle.textContent = isOn ? 'On' : 'Off';
}

function setDeviceState(isOn) {
    updateDeviceStateUI(isOn);

    fetch(databaseSignalEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: 'set_display',
            value: isOn
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Command sent:', data);
    })
    .catch(error => {
        console.error('Command failed:', error);
    });
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function chartX(secondsAgo) {
    return chartLeft + ((maximumSeconds - secondsAgo) / maximumSeconds) * chartWidth;
}

function chartY(temperature) {
    const { minimum, maximum } = getTemperatureRange();
    const safeRange = maximum - minimum || 1;
    return chartTop + ((maximum - temperature) / safeRange) * chartHeight;
}

function toDisplayTemperature(celsius) {
    return isFahrenheit ? celsius * 9 / 5 + 32 : celsius;
}

function updateThresholdLabels() {
    document.querySelector('label[for="maximum-temperature"]').textContent = `Maximum temperature (${isFahrenheit ? 'F' : 'C'})`;
    document.querySelector('label[for="minimum-temperature"]').textContent = `Minimum temperature (${isFahrenheit ? 'F' : 'C'})`;
}

function updateCurrentTemperature(readings) {
    if (readings !== (visibleSensor === 1 ? sensor1Readings : sensor2Readings)) {
        return;
    }

    const latestReading = readings.at(-1);
    if (!latestReading) {
        currentTemperature.textContent = `-- °${isFahrenheit ? 'F' : 'C'}`;
    } else if (latestReading.temperature == null) {
        currentTemperature.textContent = 'Sensor unplugged';
    } else {
        currentTemperature.textContent = `${toDisplayTemperature(latestReading.temperature).toFixed(1)}°${isFahrenheit ? 'F' : 'C'}`;
    }
    selectedSensor.textContent = `Sensor ${visibleSensor}`;
}

function getTemperatureRange() {
    return isFahrenheit
        ? { minimum: 50, maximum: 122 }
        : { minimum: minimumValue, maximum: maximumValue };
}

function addReading(readings, randomTemperature) {
    const previous = readings.at(-1)?.temperature ?? randomTemperature();
    const temperature = clamp(previous + randomTemperature(), minimumValue, maximumValue);

    readings.push({ time: Date.now(), temperature });
    while (readings.length > maximumReadings) {
        readings.shift();
    }

    renderChart(readings);
    checkTemperatureAlert(readings, temperature);
}

function addActualReading(readings, temperature) {
    // `null` is a deliberate "sensor disconnected" signal from the ESP32 and
    // must still be recorded so the chart can show a gap and keep scrolling.
    // Only reject genuinely bad (non-null, non-finite) values.
    if (temperature !== null && !Number.isFinite(temperature)) return;

    readings.push({
        time: Date.now(),
        temperature: temperature
    });

    while (readings.length > maximumReadings) {
        readings.shift();
    }

    renderChart(readings);
    checkTemperatureAlert(readings, temperature);
}

function checkTemperatureAlert(readings, temperature) {
    // A missing reading isn't a real temperature - skip alerting entirely,
    // otherwise `null < lowLimit` coerces to 0 and falsely fires a low alert.
    if (temperature == null) {
        return;
    }

    const highLimit = Number(maximumTemperature.value);
    const lowLimit = Number(minimumTemperature.value);
    const contact = notificationContact.value.trim();
    const alertState = alertStates.get(readings);
    const deviceIsOn = onOffToggle.getAttribute('aria-pressed') === 'true';

    if (!deviceIsOn || !getNotificationsEnabled() || !contact || !Number.isFinite(highLimit) || !Number.isFinite(lowLimit)) {
        return;
    }

    if (highLimit <= lowLimit) {
        notificationStatus.textContent = 'The maximum temperature must be higher than the minimum.';
        return;
    }

    const sensorNumber = readings === sensor1Readings ? 1 : 2;
    const displayTemperature = `${toDisplayTemperature(temperature).toFixed(1)}°${isFahrenheit ? 'F' : 'C'}`;
    const high = temperature > highLimit;
    const low = temperature < lowLimit;

    if (high && !alertState.high) {
        sendTemperatureAlert(highMessage.value, sensorNumber, displayTemperature).catch(() => {
            notificationStatus.textContent = 'The email alert could not be sent.';
        });
        alertState.high = true;
    } else if (!high) {
        alertState.high = false;
    }

    if (low && !alertState.low) {
        sendTemperatureAlert(lowMessage.value, sensorNumber, displayTemperature).catch(() => {
            notificationStatus.textContent = 'The email alert could not be sent.';
        });
        alertState.low = true;
    } else if (!low) {
        alertState.low = false;
    }
}

async function sendTemperatureAlert(message, sensorNumber, temperature) {
    const contact = notificationContact.value.trim();

    if (!contact) {
        notificationStatus.textContent = 'Enter an email address before enabling alerts.';
        return;
    }

    const subject = `Temperature alert: Sensor ${sensorNumber}`;
    const body = `${message}\nSensor ${sensorNumber} is reading ${temperature}.`;
    await emailjs.send(emailJsServiceId, emailJsTemplateId, {
        to_email: contact,
        subject,
        message: body
    });

    notificationStatus.textContent = 'Email alert sent.';
}

function renderChart(readings) {
    if (!readings.length) {
        return;
    }

    const newestTime = readings.at(-1).time;
    const visibleReadings = readings.filter(reading => (newestTime - reading.time) / 1000 <= maximumSeconds);

    if (!visibleReadings.length) {
        return;
    }

    // Build an SVG path instead of a single polyline so a missing (null)
    // reading breaks the line into a new subpath ('M') rather than being
    // skipped over and silently connected to the next valid point.
    let pathData = '';
    let segmentOpen = false;

    for (const reading of visibleReadings) {
        if (reading.temperature == null) {
            segmentOpen = false; // gap: next valid point starts a new segment
            continue;
        }

        const secondsAgo = (newestTime - reading.time) / 1000;
        const temperature = toDisplayTemperature(reading.temperature);
        const x = chartX(secondsAgo).toFixed(1);
        const y = chartY(temperature).toFixed(1);

        pathData += `${segmentOpen ? 'L' : 'M'}${x},${y} `;
        segmentOpen = true;
    }

    const chartNumber = readings === sensor1Readings ? 1 : 2;
    const temperatureLine = document.querySelector(`#temperature-line-${chartNumber}`);
    const latestPoint = document.querySelector(`#latest-point-${chartNumber}`);

    temperatureLine.setAttribute('d', pathData.trim());

    const latestReading = visibleReadings.at(-1);
    if (latestReading && latestReading.temperature != null) {
        latestPoint.setAttribute('cx', chartX(0));
        latestPoint.setAttribute('cy', chartY(toDisplayTemperature(latestReading.temperature)));
        latestPoint.setAttribute('visibility', 'visible');
    } else {
        // Hide the "current value" dot while the latest sample is missing,
        // instead of parking it at the bottom of the chart (which used to
        // look like a real 10°C/50°F reading).
        latestPoint.setAttribute('visibility', 'hidden');
    }

    updateCurrentTemperature(readings);
}

function drawAxes(chartNumber) {
    const axisValues = isFahrenheit
        ? [122, 108, 93, 79, 64, 50]
        : [50, 40, 30, 20, 10];
    const rightEdgeX = chartLeft + chartWidth + 32;

    const gridLines = document.querySelector(`#grid-lines-${chartNumber}`);
    const axisLabels = document.querySelector(`#axis-labels-${chartNumber}`);
    const timeAxisLabels = document.querySelector(`#time-axis-labels-${chartNumber}`);

    gridLines.innerHTML = axisValues.map(value => {
        const y = chartY(value);
        return `<line class="grid-line" x1="${chartLeft}" y1="${y}" x2="${chartLeft + chartWidth}" y2="${y}"></line>`;
    }).join('');

    axisLabels.innerHTML = axisValues.map(value => {
        const y = chartY(value) + 5;
        return `<text class="axis-label" x="${rightEdgeX}" y="${y}" text-anchor="start">${value}°</text>`;
    }).join('');

    const timeValues = [300, 200, 100, 0];
    timeAxisLabels.innerHTML = timeValues.map(seconds => {
        const x = chartX(seconds);
        return `<text class="axis-label" x="${x}" y="370" text-anchor="middle">${seconds}</text>`;
    }).join('');
}


unitToggle.addEventListener('click', () => {
    isFahrenheit = !isFahrenheit;
    unitToggle.setAttribute('aria-pressed', String(isFahrenheit));
    unitToggle.textContent = isFahrenheit ? '°F' : '°C';
    updateThresholdLabels();
    document.querySelectorAll('[id^="temperature-axis-label-"]').forEach(axisLabel => {
        axisLabel.textContent = isFahrenheit ? 'Temperature (°F)' : 'Temperature (°C)';
    });
    drawAxes(1);
    drawAxes(2);
    renderChart(sensor1Readings);
    renderChart(sensor2Readings);
});

sensorToggle.addEventListener('click', () => {
    visibleSensor = visibleSensor === 1 ? 2 : 1;
    sensorPanels.forEach((panel, index) => {
        panel.hidden = index + 1 !== visibleSensor;
    });
    sensorToggle.setAttribute('aria-pressed', String(visibleSensor === 2));
    const nextSensor = visibleSensor === 1 ? 2 : 1;
    sensorToggle.textContent = `Sensor ${nextSensor}`;
    updateCurrentTemperature(visibleSensor === 1 ? sensor1Readings : sensor2Readings);
});

onOffToggle.addEventListener('click', () => {
    const isCurrentlyOn = onOffToggle.getAttribute('aria-pressed') === 'true';
    setDeviceState(!isCurrentlyOn);
});

notificationsEnabled.addEventListener('change', () => {
    localStorage.setItem(notificationsStateStorageKey, String(notificationsEnabled.checked));
    notificationStatus.textContent = notificationsEnabled.checked
        ? 'Email notifications enabled.'
        : 'Email notifications disabled.';
});

notificationForm.addEventListener('submit', event => {
    event.preventDefault();

    if (Number(maximumTemperature.value) <= Number(minimumTemperature.value)) {
        notificationStatus.textContent = 'The maximum temperature must be higher than the minimum.';
        return;
    }

    alertStates.set(sensor1Readings, { high: false, low: false });
    alertStates.set(sensor2Readings, { high: false, low: false });
    notificationStatus.textContent = 'Alert settings saved.';
});

// async function readSensorsFromDatabase() {
//     try {
//         const response = await fetch('/api/sensor-readings');

//         if (!response.ok) {
//             throw new Error(`HTTP ${response.status}`);
//         }

//         const data = await response.json();

//         if (data.sensor1 == null) {
//             throw new Error('Sensor 1 Disconnected.');
//         }
//         if (data.sensor2 == 'null') {
//             throw new Error('Sensor 2 Disconnected.');
//         }
//         else {
//         addActualReading(sensor1Readings, Number(data.sensor1));
//         addActualReading(sensor2Readings, Number(data.sensor2));
//         }

//     } catch (error) {
//         console.error('Failed to read sensor data:', error);
//     }
// }
async function readSensorsFromDatabase() {
    try {
        const response = await fetch('/api/sensor-readings');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Check sensor 1
        if (data.sensor1 == null) {
            console.error("Sensor 1 Disconnected");
            addActualReading(sensor1Readings, null);
        } else {
            addActualReading(sensor1Readings, Number(data.sensor1));
        }

        // Check sensor 2
        if (data.sensor2 == null) {
            console.error("Sensor 2 Disconnected");
            addActualReading(sensor2Readings, null);
        } else {
            addActualReading(sensor2Readings, Number(data.sensor2));
        }

    } catch (error) {
        console.error('Failed to read sensor data:', error);
    }
}


updateDeviceStateUI(false);
notificationsEnabled.checked = getNotificationsEnabled();

drawAxes(1);
drawAxes(2);
renderChart(sensor1Readings);
renderChart(sensor2Readings);
alertStates.set(sensor1Readings, { high: false, low: false });
alertStates.set(sensor2Readings, { high: false, low: false });

// Get new sensor data from Flask every second
setInterval(readSensorsFromDatabase, 1000);

// Get the first reading immediately
readSensorsFromDatabase();