import Api from "./api";
import Controller from "./controller";
import logger from "./logger";

const {
  MSB_USER: username,
  MSB_PASS: password,
  MQTT_HOST: mqttHost,
  MQTT_PREFIX: mqttPrefix = "mysmartblinds",
} = process.env;

process.on("exit", function () {
  logger.info("Exiting...");
});

// catch ctrl+c event and exit normally
process.on("SIGINT", function () {
  process.exit(2);
});

if (!username || !password) {
  logger.error("Missing required username and/or password properties");
  process.exit(1);
}

if (!mqttHost) {
  logger.error("Missing required mqtt host property");
  process.exit(1);
}

if (mqttPrefix.includes("/")) {
  logger.error("Mqtt prefix property cannot contain any forward slashes");
  process.exit(1);
}

const init = async () => {
  const api = new Api({ username, password });

  try {
    const controller = new Controller({ api, mqttHost, mqttPrefix });
    await controller.initialize();
  } catch (error) {
    logger.error("Encountered fatal error: %s", error);
    process.exit(1);
  }
};

init();
