import Api from "./api";
import Controller from "./controller";

const {
  MSB_USER: username,
  MSB_PASS: password,
  MQTT_HOST: mqttHost,
  MQTT_PREFIX: mqttPrefix = "mysmartblinds",
} = process.env;

process.on("exit", function () {
  console.info("Exiting...");
});

// catch ctrl+c event and exit normally
process.on("SIGINT", function () {
  process.exit(2);
});

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

const init = async () => {
  const api = new Api({ username, password });

  try {
    const controller = new Controller({ api, mqttHost, mqttPrefix });
    await controller.initialize();
  } catch (e) {
    console.error("Encountered fatal error: %s", e);
    process.exit(1);
  }
};

init();
