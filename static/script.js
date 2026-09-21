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
// One physical-button-style toggle per sensor (spec 5b: "virtually press
// the button in the third box"), replacing the old single on-off-toggle
// that actually just controlled the box's LCD backlight, not a sensor.
const sensor1PowerToggle = document.querySelector('#sensor1-power-toggle');
const sensor2PowerToggle = document.querySelector('#sensor2-power-toggle');
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

// Reflects a sensor's real hardware enabled state (as last reported by the
// box) on its toggle button. `enabled === null` means we don't know yet
// (nothing heard from the box, or the box is currently stale/off) - in
// that case leave the button showing whatever it last showed rather than
// guessing, since flipping it to "Off" could misrepresent the box's actual
// state once it comes back.
function updateSensorPowerButtonUI(button, sensorNumber, enabled) {
    if (enabled == null) {
        return;
    }
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = `Sensor ${sensorNumber}: ${enabled ? 'On' : 'Off'}`;
}

// Virtually "presses" a sensor's physical button by telling the box what
// state to be in. Sends an explicit true/false (not a toggle) based on the
// button's last known real state, so it stays correct even if someone also
// pressed the physical button around the same time.
function sendSensorCommand(sensorNumber, value) {
    fetch(databaseSignalEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: 'set_sensor',
            sensor: sensorNumber,
            value
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
    } else if (latestReading.unplugged) {
        // Button is on, but the probe itself isn't connected/working.
        currentTemperature.textContent = 'Temperature Sensor Unplugged';
    } else if (latestReading.temperature == null) {
        // Button is off, or the third box itself isn't reporting.
        currentTemperature.textContent = 'No Data Available';
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

// `unplugged` distinguishes *why* temperature is null (see
// updateCurrentTemperature). `options.time` lets this same function replay
// server-recorded history at its original timestamps (see
// loadSensorHistory); `options.notify` is set to false during that replay
// so hydrating 300 past samples on page load doesn't re-fire 300 alert
// emails for readings that already happened.
function addActualReading(readings, temperature, unplugged, options = {}) {
    const { time = Date.now(), notify = true } = options;

    // `null` is a deliberate "no reading" signal and must still be recorded
    // so the chart can show a gap and keep scrolling. Only reject genuinely
    // bad (non-null, non-finite) values.
    if (temperature !== null && !Number.isFinite(temperature)) return;

    readings.push({
        time,
        temperature,
        unplugged: Boolean(unplugged)
    });

    while (readings.length > maximumReadings) {
        readings.shift();
    }

    renderChart(readings);

    if (notify) {
        checkTemperatureAlert(readings, temperature);
    }
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

    // Note: whether a sensor's button is on/off (physically or via its
    // website toggle, spec 5b) must NOT separately gate alerting - it's
    // already covered above by the `temperature == null` check, which is
    // the one real signal for "no reading available" (spec 5a-ii, 7).
    if (!getNotificationsEnabled() || !contact || !Number.isFinite(highLimit) || !Number.isFinite(lowLimit)) {
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

sensor1PowerToggle.addEventListener('click', () => {
    const isCurrentlyOn = sensor1PowerToggle.getAttribute('aria-pressed') === 'true';
    sendSensorCommand(1, !isCurrentlyOn);
});

sensor2PowerToggle.addEventListener('click', () => {
    const isCurrentlyOn = sensor2PowerToggle.getAttribute('aria-pressed') === 'true';
    sendSensorCommand(2, !isCurrentlyOn);
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

async function readSensorsFromDatabase() {
    try {
        const response = await fetch('/api/sensor-readings');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Check sensor 1
        if (data.sensor1 == null) {
            addActualReading(sensor1Readings, null, data.sensor1_unplugged);
        } else {
            addActualReading(sensor1Readings, Number(data.sensor1), false);
        }

        // Check sensor 2
        if (data.sensor2 == null) {
            addActualReading(sensor2Readings, null, data.sensor2_unplugged);
        } else {
            addActualReading(sensor2Readings, Number(data.sensor2), false);
        }

        // Keep each sensor's website toggle in sync with the box's real
        // state. While the box is stale (not reporting), leave the buttons
        // showing their last known state rather than guessing.
        updateSensorPowerButtonUI(sensor1PowerToggle, 1, data.stale ? null : data.sensor1_enabled);
        updateSensorPowerButtonUI(sensor2PowerToggle, 2, data.stale ? null : data.sensor2_enabled);

    } catch (error) {
        console.error('Failed to read sensor data:', error);
    }
}

// Reloads the last up-to-300 seconds of readings the server has recorded,
// so refreshing the page redraws the graph immediately instead of starting
// empty and waiting 5 minutes to refill it.
async function loadSensorHistory() {
    try {
        const response = await fetch('/api/sensor-history');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const history = await response.json();

        for (const entry of history) {
            const options = { time: entry.time, notify: false };
            addActualReading(
                sensor1Readings,
                entry.sensor1 == null ? null : Number(entry.sensor1),
                entry.sensor1_unplugged,
                options
            );
            addActualReading(
                sensor2Readings,
                entry.sensor2 == null ? null : Number(entry.sensor2),
                entry.sensor2_unplugged,
                options
            );
        }
    } catch (error) {
        console.error('Failed to load sensor history:', error);
    }
}


notificationsEnabled.checked = getNotificationsEnabled();

drawAxes(1);
drawAxes(2);
alertStates.set(sensor1Readings, { high: false, low: false });
alertStates.set(sensor2Readings, { high: false, low: false });

// Rebuild the last 300 seconds of graph from the server's history first
// (so a refresh doesn't start from a blank chart), then start live polling.
loadSensorHistory().then(() => {
    renderChart(sensor1Readings);
    renderChart(sensor2Readings);

    // Get new sensor data from Flask every second
    setInterval(readSensorsFromDatabase, 1000);

    // Get the first live reading immediately
    readSensorsFromDatabase();
});