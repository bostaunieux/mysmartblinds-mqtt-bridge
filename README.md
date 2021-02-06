# mysmartblinds-bridge

## Setup

Define environment variables for the following:

| Key          | Description                                  |
|--------------|----------------------------------------------|
| MQTT_HOST    | MQTT broker host, e.g. mqtt://[username:password@]192.168.1.6  |
| MSB_USER     | MySmartBlinds account username               |
| MSB_PASS     | MySmartBlinds account password               |
| MQTT_PREFIX  | Mqtt topic prefix, default "mysmartblinds"   |


## Run
Outside of docker, run
```
npm install

npm run build

npm start
```

## Build a docker tag

1. Build tag
	```
	docker build -t bostaunieux/mysmartblinds-bridge:latest .
	```
2. Publish tag
	```
	docker push bostaunieux/mysmartblinds-bridge:latest
	```

> If there are issues with access, ensure you're logged in - `docker login`
