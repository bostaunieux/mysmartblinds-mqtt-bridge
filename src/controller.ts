import { invertBy, throttle } from "lodash";
import mqtt, { MqttClient } from "mqtt";
import Api from "./api";
import { BlindInfo, BlindState } from "./config";

interface ControllerConfg {
  mqttHost: string;
  mqttPrefix: string;
  api: Api;
}

interface QueuedBlindUpdate {
  blinds: Array<string>;
  position: number;
}

export default class Controller {
  private api: Api;
  private client: MqttClient | null;
  private mqttHost: string;
  private mqttPrefix: string;
  private blindsByRoom: Map<string, Map<string, BlindInfo>>;
  private blindsById: Map<string, BlindInfo>;
  private updateQueue: Set<QueuedBlindUpdate>;
  private updateTimer: NodeJS.Timeout | null;

  constructor({ mqttHost, mqttPrefix, api }: ControllerConfg) {
    this.api = api;
    this.mqttHost = mqttHost;
    this.mqttPrefix = mqttPrefix;
    this.client = null;
    this.blindsByRoom = new Map<string, Map<string, BlindInfo>>();
    this.blindsById = new Map<string, BlindInfo>();
    this.updateQueue = new Set<QueuedBlindUpdate>();
    this.updateTimer = null;
  }

  static normalize = (name: string): string => name.replace(/\s/g, "_").toLowerCase();

  /**
   * Bootstrap the mqtt broker and subscribe to topics for all available blinds
   */
  public initialize = async (): Promise<void> => {
    await this.findBlinds();

    this.client?.end();

    this.client = mqtt.connect(this.mqttHost, {
      will: {
        topic: `${this.mqttPrefix}/availability`,
        payload: "offline",
        qos: 1,
        retain: true,
      },
    });

    this.client.on("error", (error) => {
      console.error(error);
    });

    this.client.on("connect", () => {
      console.info("Connected to home automation mqtt broker");

      this.client?.publish(`${this.mqttPrefix}/availability`, "online", { qos: 1, retain: true });

      this.client?.subscribe(`${this.mqttPrefix}/refresh`);
      // matches "prefix/room_name/blind_name/set"
      this.client?.subscribe(`${this.mqttPrefix}/+/+/set`, { qos: 2 });

      this.updateBlindsState();
    });

    this.client.on("message", (topic, message) => {
      if (topic === `${this.mqttPrefix}/refresh`) {
        return this.updateBlindsState();
      }

      const [, roomName, blindName, action] = topic.split("/");

      const blind = this.blindsByRoom.get(roomName)?.get(blindName);
      if (blind && action === "set") {
        const position = +message.toString();
        return this.queueBlindsUpdate({ blinds: [blind.id], position });
      }

      console.warn("No handler for topic: %s", topic);
    });
  };

  /**
   * Request all available blinds from the hub
   */
  public findBlinds = async (): Promise<void> => {
    const blinds = await this.api.findBlinds();
    if (!blinds || blinds.length === 0) {
      console.error("Did not find any blinds; exiting");
      throw new Error("Did not find any blinds");
    }

    this.blindsByRoom.clear();
    this.blindsById.clear();

    blinds.forEach((blind) => {
      const roomName = Controller.normalize(blind.room);
      const blindName = Controller.normalize(blind.name);
      if (!this.blindsByRoom.has(roomName)) {
        this.blindsByRoom.set(roomName, new Map<string, BlindInfo>());
      }
      this.blindsByRoom.get(roomName)?.set(blindName, blind);
      this.blindsById.set(blind.id, blind);
    });

    const topics = Object.values(Object.fromEntries(this.blindsById)).map((blind) => {
      const roomName = Controller.normalize(blind.room);
      const blindName = Controller.normalize(blind.name);

      return `${this.mqttPrefix}/${roomName}/${blindName}/`;
    });

    console.info("Registering topics: %s", topics);
  }

  /**
   * Update the state of any blinds
   */
  public updateBlindsState = throttle(async () => {
    console.info("Processing request to get blinds status");

    const blindIds = Object.values(Object.fromEntries(this.blindsById)).map((blind) => blind.id);

    const blindsResponse = await this.api.getStatus(blindIds);

    blindsResponse && this.notifyStateChange(blindsResponse);
  }, 10000);

  /**
   * Queue requests to update position so we can reduce the total number of service calls. This will
   * comebine separate requests for the same position into one call and ensure if requests for the same
   * blind are made quickly, the latest position will be used.
   *
   * @param {{blinds: array, position: number}}} request
   */
  private queueBlindsUpdate = (request: QueuedBlindUpdate) => {
    this.updateQueue.add(request);

    if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        const requests = [...this.updateQueue];

        this.updateTimer = null;
        this.updateQueue.clear();

        // first iternate through the list to figure out the position each blind should get;
        // if multiple requests came in for the same blind, the last position received will be used
        const positionsByBlind = requests.reduce((entries, request) => {
          request.blinds.forEach((blind) => {
            entries.set(blind, request.position);
          });
          return entries;
        }, new Map<string, number>());

        // then invert the map, so we combine blinds being set to the same position
        const blindsByPosition = invertBy(Object.fromEntries(positionsByBlind));
        Object.entries(blindsByPosition).forEach(([position, blinds]) => {
          this.updateBlindsPosition(blinds, +position);
        });
      }, 750);
    }
  };

  private updateBlindsPosition = async (blindIds: Array<string>, position: number) => {
    console.info("Processing request to update blinds position");

    if (isNaN(position)) {
      console.warn("Recieved invalid positon: %s; ignoring");
      return;
    }

    position = Math.max(0, Math.min(180, position));

    console.info("Changing position to: %s for blinds: %s", position, blindIds.join(", "));
    const blindsResponse = await this.api.updateTiltPosition(blindIds, position);

    blindsResponse && this.notifyStateChange(blindsResponse);
  };

  private notifyStateChange = (blindsResponse: Array<BlindState>) => {
    blindsResponse.forEach((blind) => {
      const position = blind.position < 4 ? 0 : blind.position > 176 ? 180 : blind.position;
      const state = position === 0 || position === 180 ? "closed" : "open";

      const blindEntry = this.blindsById.get(blind.id);

      if (!blindEntry) {
        console.error("Ignoring update request received for an unknown blind: %s", blind);
        return;
      }

      const roomName = Controller.normalize(blindEntry.room);
      const blindName = Controller.normalize(blindEntry.name);

      this.client?.publish(
        `${this.mqttPrefix}/${roomName}/${blindName}/state`,
        JSON.stringify({ ...blind, position, state }),
        { retain: true }
      );
      this.client?.publish(`${this.mqttPrefix}/${roomName}/${blindName}/position`, position.toString(), {
        retain: true,
      });
    });
  };
}
