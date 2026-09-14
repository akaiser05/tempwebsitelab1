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

function chartX(secondsAgo) {
    return chartLeft + ((maximumSeconds - secondsAgo) / maximumSeconds) * chartWidth;
}

function chartY(temperature) {
    const { minimum, maximum } = getTemperatureRange();
    return chartTop + ((maximum - temperature) / (maximum - minimum)) * chartHeight;
}

function toDisplayTemperature(celsius) {
    return isFahrenheit ? celsius * 9 / 5 + 32 : celsius;
}

function getTemperatureRange() {
    return isFahrenheit
        ? { minimum: -4, maximum: 122 }
        : { minimum: minimumValue, maximum: maximumValue };
}

function addReading() {
    const now = new Date();
    const previous = readings.at(-1)?.temperature ?? 20;
    const temperature = Math.max(minimumValue, Math.min(maximumValue, previous + (Math.random() - 0.5) * 8));

    readings.push({ time: now, temperature });
    while (readings.length > maximumReadings) {
        readings.shift();
    }

    renderChart();
}

function renderChart() {
    const newestTime = readings.at(-1).time;
    const visibleReadings = readings.filter(reading => (newestTime - reading.time) / 1000 <= maximumSeconds);
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
addReading();
setInterval(addReading, 1000);
