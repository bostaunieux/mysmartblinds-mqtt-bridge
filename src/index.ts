import Api from "./api";
import Controller from "./controller";

const {
  MSB_USER: username,
  MSB_PASS: password,
  MQTT_HOST: mqttHost,
  MQTT_PREFIX: mqttPrefix = "mysmartblinds",
} = process.env;

if (!username || !password) {
  console.error("Missing required username and/or password properties");
  process.exit(1);
}

if (!mqttHost) {
  console.error("Missing required mqtt host property");
  process.exit(1);
}

if (mqttPrefix.includes("/")) {
  console.error("Mqtt prefix property cannot contain any forward slashes");
  process.exit(1);
}

const api = new Api({
  username,
  password,
});

try {
  new Controller({ mqttHost, mqttPrefix, api }).initialize();
} catch (e) {
  console.error("Encountered fatal error: %s", e);
  process.exit(1);
}
