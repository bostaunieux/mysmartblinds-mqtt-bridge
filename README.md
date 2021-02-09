# mysmartblinds-mqtt-bridge

## Overview

Control and monitor MySmartBlinds blinds connected to a MySmartBlinds hub. Blinds are auto-discovered though the hub, and MQTT topics are created for each to monitor their state and send tilt commands. This currently does not poll the blinds state, so updates to blind positions done through the MySmartBlinds app
or through schedules configured on the blinds, will not be received. There is, however, a mechanism for requesting an update to blinds state.

Note this service interacts with blinds through a hub; it will not make a bluetooth connection directly to individual blinds.

## Prerequisites

The following are required:

* A MySmartBlinds account with at least one MySmartBlinds blind
* A MySmartBlinds hub
* An MQTT broker for sending messages to and receiving messages from the hub

## Setup

Define environment variables for the following:

| Key          | Required | Description                                                    |
|--------------|----------|----------------------------------------------------------------|
| MSB_USER     | Yes      | MySmartBlinds account username                                 |
| MSB_PASS     | Yes      | MySmartBlinds account password                                 |
| MQTT_HOST    | Yes      | MQTT broker host, e.g. mqtt://[username:password@]192.168.1.6  |
| MQTT_PREFIX  | No       | MQTT topic prefix, default `mysmartblinds`                     |

## Mqtt integration

This service subscribe to topics for each blind it discovers. Topics will be generated based on the configured MQTT_PREFIX, the name of the room containing the blind and the blind name. Room name and blind name will be lowercased, with all spaces replaced with underscores. See the output for specific topics that get created.

Topics to be published include the following

### Publish topics

#### `mysmartblinds/{room_name}/{blind_name}/set`

Set the tilt position of a blind. The payload will be the numeric blind position to set.

#### `mysmartblinds/refresh`

Trigger a refresh of all blinds state. This does not accept a payload.

### Subscribe topics

#### `mysmartblinds/{room_name}/{blind_name}/state`

Current state of the blind. Note any changes made outside this MQTT service won't automatically be picked up. See the `refresh` topic for manually triggering an update.

Topic payload format:
```
{
	"id": "FGVeSeLK",       // blind identifier / encoded mac address
	"batteryLevel": 90,     // battery level percentage
	"signalStrength": -75,  // RSSI
	"position": 0,          // numeric blind position from 0 - 180
	"state": "closed"       // "open" or "closed"
}
```

#### `mysmartblinds/availability`

Service last will and testament. When online, the topic payload will be `online`. When offline, the topic payload will be `offline`.


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
	docker build -t bostaunieux/mysmartblinds-mqtt-bridge:latest .
	```
2. Run tag
	```
	docker run -e MSB_USER=... -e MSB_PASS=... bostaunieux/mysmartblinds-mqtt-bridge:latest
	```
3. Publish tag
	```
	docker push bostaunieux/mysmartblinds-mqtt-bridge:latest
	```

> If there are issues with access, ensure you're logged in - `docker login`
