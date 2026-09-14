const gridLines = document.querySelector('#grid-lines');
const axisLabels = document.querySelector('#axis-labels');
const timeAxisLabels = document.querySelector('#time-axis-labels');
const temperatureLine = document.querySelector('#temperature-line');
const latestPoint = document.querySelector('#latest-point');
const unitToggle = document.querySelector('#unit-toggle');
const temperatureAxisLabel = document.querySelector('#temperature-axis-label');

const chartLeft = 70;
const chartTop = 20;
const chartWidth = 800;
const chartHeight = 320;
const minimumValue = -20;
const maximumValue = 50;
const maximumSeconds = 300;
const maximumReadings = 300;
const readings = [];
let isFahrenheit = false;

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

function getTemperatureRange() {
    return isFahrenheit
        ? { minimum: -4, maximum: 122 }
        : { minimum: minimumValue, maximum: maximumValue };
}

function seedReadings() {
    const now = Date.now();
    const baseLine = 22;

    for (let secondsAgo = maximumSeconds; secondsAgo >= 0; secondsAgo -= 1) {
        const wave = Math.sin(secondsAgo / 16) * 7 + Math.cos(secondsAgo / 31) * 4;
        const offset = Math.sin(secondsAgo / 8) * 3;
        const temperature = clamp(baseLine + wave + offset, minimumValue, maximumValue);

        readings.push({
            time: now - secondsAgo * 1000,
            temperature,
        });
    }
}

function addReading() {
    const previous = readings.at(-1)?.temperature ?? 20;
    const temperature = clamp(previous + (Math.random() - 0.5) * 8, minimumValue, maximumValue);

    readings.push({ time: Date.now(), temperature });
    while (readings.length > maximumReadings) {
        readings.shift();
    }

    renderChart();
}

function renderChart() {
    if (!readings.length) {
        return;
    }

    const newestTime = readings.at(-1).time;
    const visibleReadings = readings.filter(reading => (newestTime - reading.time) / 1000 <= maximumSeconds);

    if (!visibleReadings.length) {
        return;
    }

    const points = visibleReadings.map(reading => {
        const secondsAgo = (newestTime - reading.time) / 1000;
        const temperature = toDisplayTemperature(reading.temperature);
        return `${chartX(secondsAgo).toFixed(1)},${chartY(temperature).toFixed(1)}`;
    });
    const latest = visibleReadings.at(-1);

    temperatureLine.setAttribute('points', points.join(' '));
    latestPoint.setAttribute('cx', chartX(0));
    latestPoint.setAttribute('cy', chartY(toDisplayTemperature(latest.temperature)));
}

function drawAxes() {
    const axisValues = isFahrenheit
        ? [122, 98, 74, 50, 26, -4]
        : [50, 35, 20, 5, -10, -20];
    gridLines.innerHTML = axisValues.map(value => {
        const y = chartY(value);
        return `<line class="grid-line" x1="${chartLeft}" y1="${y}" x2="${chartLeft + chartWidth}" y2="${y}"></line>`;
    }).join('');

    axisLabels.innerHTML = axisValues.map(value => {
        const y = chartY(value) + 5;
        return `<text class="axis-label" x="${chartLeft - 12}" y="${y}" text-anchor="end">${value}°</text>`;
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
    temperatureAxisLabel.textContent = isFahrenheit ? 'Temperature (°F)' : 'Temperature (°C)';
    drawAxes();
    renderChart();
});

drawAxes();
seedReadings();
renderChart();
setInterval(addReading, 1000);
