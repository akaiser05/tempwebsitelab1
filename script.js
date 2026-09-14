const unitToggle = document.querySelector('#unit-toggle');
const sensorToggle = document.querySelector('#sensor-toggle');
const selectedSensor = document.querySelector('#selected-sensor');
const currentTemperature = document.querySelector('#current-temperature');
const sensorPanels = [
    document.querySelector('#sensor-panel-1'),
    document.querySelector('#sensor-panel-2')
];

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

let isFahrenheit = false;
let visibleSensor = 1;

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

function updateCurrentTemperature(readings) {
    if (readings !== (visibleSensor === 1 ? sensor1Readings : sensor2Readings)) {
        return;
    }

    const latestReading = readings.at(-1);
    currentTemperature.textContent = latestReading
        ? `${toDisplayTemperature(latestReading.temperature).toFixed(1)}°${isFahrenheit ? 'F' : 'C'}`
        : `-- °${isFahrenheit ? 'F' : 'C'}`;
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

    const points = [];
    let latestValidReading = null;

    for (const reading of visibleReadings) {
        if (reading.temperature == null) {
            continue;
        }

        const secondsAgo = (newestTime - reading.time) / 1000;
        const temperature = toDisplayTemperature(reading.temperature);
        points.push(`${chartX(secondsAgo).toFixed(1)},${chartY(temperature).toFixed(1)}`);
        latestValidReading = reading;
    }

    const chartNumber = readings === sensor1Readings ? 1 : 2;
    const temperatureLine = document.querySelector(`#temperature-line-${chartNumber}`);
    const latestPoint = document.querySelector(`#latest-point-${chartNumber}`);

    temperatureLine.setAttribute('points', points.join(' '));

    if (latestValidReading) {
        latestPoint.setAttribute('cx', chartX(0));
        latestPoint.setAttribute('cy', chartY(toDisplayTemperature(latestValidReading.temperature)));
    } else {
        latestPoint.setAttribute('cx', chartX(0));
        latestPoint.setAttribute('cy', chartY(getTemperatureRange().minimum));
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
    notVisibleSensor = visibleSensor === 1 ? 2 : 1;
    sensorPanels.forEach((panel, index) => {
        panel.hidden = index + 1 !== visibleSensor;
    });
    sensorToggle.setAttribute('aria-pressed', String(visibleSensor === 2));
    sensorToggle.textContent = `Sensor ${visibleSensor}`;
    updateCurrentTemperature(visibleSensor === 1 ? sensor1Readings : sensor2Readings);
});

const sensor1RandomTemperature = () => (Math.random() - 0.5) * 8;
const sensor2RandomTemperature = () => (Math.random() - 0.5) * 14;

drawAxes(1);
drawAxes(2);
renderChart(sensor1Readings);
renderChart(sensor2Readings);
setInterval(() => addReading(sensor1Readings, sensor1RandomTemperature), 1000);
setInterval(() => addReading(sensor2Readings, sensor2RandomTemperature), 1000);
