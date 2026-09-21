from flask import Flask, render_template, request, jsonify
import os
import time
import threading
from collections import deque

app = Flask(__name__)

# Latest sensor data received from ESP32. sensor1_unplugged/sensor2_unplugged
# distinguish "sensor button is off" (null, unplugged=False -> website shows
# "No Data Available") from "button is on but the probe is disconnected"
# (null, unplugged=True -> website shows "Temperature Sensor Unplugged").
sensor_data = {
    "sensor1": None,
    "sensor1_unplugged": False,
    "sensor1_enabled": False,
    "sensor2": None,
    "sensor2_unplugged": False,
    "sensor2_enabled": False,
}

# When the ESP32 last actually POSTed data (0 = never yet). Used to detect
# the "box is off / not posting" case, which is different from an individual
# sensor reporting null while the box IS posting.
last_post_time = 0

# Consider data stale if we haven't heard from the ESP32 in this long.
# Should be comfortably longer than the ESP32's own post interval (currently
# ~1s) so normal network jitter doesn't cause false gaps.
STALE_THRESHOLD_SECONDS = 3

# Commands waiting for the ESP32, oldest first. A queue (not a single slot)
# so that pressing both sensor toggle buttons within the same ~1s ESP32
# poll interval delivers both commands instead of the second one silently
# overwriting the first.
pending_commands = deque()

# Rolling 300-sample (5 minute) history of both sensors, recorded once a
# second by a background thread - independent of whether any browser tab
# happens to be polling - so refreshing the page can redraw the graph
# immediately from the server's record instead of starting from empty.
HISTORY_LENGTH = 300
history = deque(maxlen=HISTORY_LENGTH)
history_lock = threading.Lock()


def _current_snapshot():
    """Build one reading in the same shape /api/sensor-readings returns."""
    if time.time() - last_post_time > STALE_THRESHOLD_SECONDS:
        return {
            "sensor1": None, "sensor1_unplugged": False,
            "sensor2": None, "sensor2_unplugged": False,
            "stale": True,
        }
    return {
        "sensor1": sensor_data.get("sensor1"),
        "sensor1_unplugged": sensor_data.get("sensor1_unplugged", False),
        "sensor1_enabled": sensor_data.get("sensor1_enabled", False),
        "sensor2": sensor_data.get("sensor2"),
        "sensor2_unplugged": sensor_data.get("sensor2_unplugged", False),
        "sensor2_enabled": sensor_data.get("sensor2_enabled", False),
        "stale": False,
    }


def _history_recorder():
    while True:
        time.sleep(1)
        snapshot = _current_snapshot()
        snapshot["time"] = int(time.time() * 1000)
        with history_lock:
            history.append(snapshot)


@app.route('/')
def home():
    return render_template('index.html')


# --------------------------------------------------
# ESP32 -> Flask
# ESP32 sends sensor JSON here
# --------------------------------------------------
@app.route('/api/esp32-data', methods=['POST'])
def receive_esp32_data():
    global sensor_data, last_post_time

    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON received"}), 400

    print("Received from ESP32:", data)

    # Expected:
    # {
    #     "sensor1": 25.4,
    #     "sensor2": 27.1
    # }

    sensor_data.update(data)
    last_post_time = time.time()

    return jsonify({"status": "ok"})


# --------------------------------------------------
# Website -> Flask
# Website sends commands here
# --------------------------------------------------
@app.route('/api/device-command', methods=['POST'])
def receive_command():
    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON received"}), 400

    print("Command from website:", data)

    pending_commands.append(data)

    return jsonify({"status": "ok"})


# --------------------------------------------------
# ESP32 -> Flask
# ESP32 checks for a command here
# --------------------------------------------------
@app.route('/api/esp32-command', methods=['GET'])
def send_command():
    if not pending_commands:
        return jsonify({"command": None})

    # Oldest first, one per poll - any others left queued go out on the
    # ESP32's next ~1s poll rather than being dropped.
    command = pending_commands.popleft()

    print("Sending command to ESP32:", command)

    return jsonify(command)


# --------------------------------------------------
# Website -> Flask
# Website gets latest sensor readings here
# --------------------------------------------------
@app.route('/api/sensor-readings', methods=['GET'])
def get_sensor_readings():
    # If the ESP32 hasn't posted recently (box is off, unplugged, or lost
    # connection), stop returning the last cached values - they're stale,
    # not current. Report both sensors as null, which the front end shows
    # as "No Data Available" (never "unplugged" - that's a real signal from
    # a box that IS reporting, not a guess made because the box went quiet).
    return jsonify(_current_snapshot())


# --------------------------------------------------
# Website -> Flask
# Website fetches up to the last 300 one-second samples here, so a page
# refresh can redraw the graph immediately instead of starting empty.
# --------------------------------------------------
@app.route('/api/sensor-history', methods=['GET'])
def get_sensor_history():
    with history_lock:
        return jsonify(list(history))


if __name__ == '__main__':
    debug_mode = True

    # Guard against Flask's debug reloader importing/running this file
    # twice (once as a watcher process, once as the real server) - without
    # this the history recorder thread would start twice.
    if not debug_mode or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        threading.Thread(target=_history_recorder, daemon=True).start()

    # 0.0.0.0 allows ESP32s/other devices on your LAN to connect.
    # threaded=True so the once-a-second history recorder and incoming
    # ESP32/website requests don't block each other.
    app.run(host='0.0.0.0', port=5000, debug=debug_mode, threaded=True)