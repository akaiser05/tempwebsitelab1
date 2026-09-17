from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Latest sensor data received from ESP32
sensor_data = {
    "sensor1": 0,
    "sensor2": 0
}

# Latest command waiting for ESP32
pending_command = None


@app.route('/')
def home():
    return render_template('index.html')


# --------------------------------------------------
# ESP32 -> Flask
# ESP32 sends sensor JSON here
# --------------------------------------------------
@app.route('/api/esp32-data', methods=['POST'])
def receive_esp32_data():
    global sensor_data

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

    return jsonify({"status": "ok"})


# --------------------------------------------------
# Website -> Flask
# Website sends commands here
# --------------------------------------------------
@app.route('/api/device-command', methods=['POST'])
def receive_command():
    global pending_command

    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON received"}), 400

    print("Command from website:", data)

    pending_command = data

    return jsonify({"status": "ok"})


# --------------------------------------------------
# ESP32 -> Flask
# ESP32 checks for a command here
# --------------------------------------------------
@app.route('/api/esp32-command', methods=['GET'])
def send_command():
    global pending_command

    command = pending_command

    # Clear it so the same command isn't executed repeatedly
    pending_command = None

    if command is None:
        return jsonify({"command": None})

    print("Sending command to ESP32:", command)

    return jsonify(command)


# --------------------------------------------------
# Website -> Flask
# Website gets latest sensor readings here
# --------------------------------------------------
@app.route('/api/sensor-readings', methods=['GET'])
def get_sensor_readings():
    return jsonify(sensor_data)


if __name__ == '__main__':
    # 0.0.0.0 allows ESP32s/other devices on your LAN to connect
    app.run(host='0.0.0.0', port=5000, debug=True)