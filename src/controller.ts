import { invertBy, throttle } from "lodash";
import mqtt, { MqttClient } from "mqtt";
import Api from "./api";
import { BlindInfo, BlindState } from "./config";
import logger from "./logger";

interface ControllerProps {
  /** MQTT broker host */
  mqttHost: string;
  /** MQTT topic prefix for all topics being created */
  mqttPrefix: string;
  /** API connection */
  api: Api;
}

interface QueuedBlindUpdate {
  blinds: Array<string>;
  position: number;
}

const BLINDS_UPDATE_THROTTLE_MS = 10 * 1000; // 10 seconds

const CONNECTION_RETRY_DELAY_MS = 30 * 1000; // 30 seconds

export const UPDATE_QUEUE_DELAY_MS = 750;

const normalize = (name: string): string => name.replace(/\s/g, "_").toLowerCase();

/**
 * Class for managing the connection to the MQTT broker and processing requests on the
 * MySmartBlinds hub.
 */
export default class Controller {
  private api: Api;
  private mqttHost: string;
  private mqttPrefix: string;
  private client?: MqttClient;
  private updateTimer?: NodeJS.Timeout;

  private updateQueue = new Set<QueuedBlindUpdate>();
  readonly blindsByRoom = new Map<string, Map<string, BlindInfo>>();
  readonly blindsById = new Map<string, BlindInfo>();

  constructor({ api, mqttHost, mqttPrefix }: ControllerProps) {
    this.api = api;
    this.mqttHost = mqttHost;
    this.mqttPrefix = mqttPrefix;
  }

  /**
   * Bootstrap the mqtt broker and subscribe to topics for all available blinds
   */
  public initialize = async (): Promise<void> => {
    await this.updateAvailableBlinds();

    // reset the connection before initializing, in case of reinitialization
    this.client?.end();

    this.client = this.getConnection();

    this.client.on("error", (error) => {
      logger.error("MQTT connection error: %s; will retry after a delay", error);
    });
    this.client.on("connect", this.onConnect.bind(this));
    this.client.on("message", this.onMessage.bind(this));
  };

  /**
   * Request all available blinds from the hub
   */
  public updateAvailableBlinds = async (): Promise<void> => {
    const blinds = await this.api.findBlinds();

    if (!blinds || blinds.length === 0) {
      throw new Error("Did not find any blinds");
    }

    this.blindsByRoom.clear();
    this.blindsById.clear();

    blinds.forEach((blind) => {
      const roomName = normalize(blind.room);
      const blindName = normalize(blind.name);

      if (!this.blindsByRoom.has(roomName)) {
        this.blindsByRoom.set(roomName, new Map<string, BlindInfo>());
      }
      this.blindsByRoom.get(roomName)?.set(blindName, blind);
      this.blindsById.set(blind.id, blind);
    });
  };

  /**
   * Update the state of any blinds. To avoid sending too many update requests at once;
   * requests are throttled.
   */
  public updateBlindsState = throttle(async (): Promise<void> => {
    logger.info("Processing request to get blinds status...");

    const blindIds = Array.from(this.blindsById).map(([, blind]) => blind.id);

    const blindsResponse = await this.api.getBlindsState(blindIds);

    blindsResponse && this.publishStateChange(blindsResponse);
  }, BLINDS_UPDATE_THROTTLE_MS);

  private getConnection = () => {
    return mqtt.connect(this.mqttHost, {
      will: {
        topic: `${this.mqttPrefix}/availability`,
        payload: Buffer.from("offline", "utf8"),
        qos: 1,
        retain: true,
      },
      reconnectPeriod: CONNECTION_RETRY_DELAY_MS,
    });
  };

  private onConnect = () => {
    logger.info("Connected to home automation mqtt broker");

    this.client?.publish(`${this.mqttPrefix}/availability`, "online", { qos: 1, retain: true });

    this.client?.subscribe(`${this.mqttPrefix}/refresh`);
    // matches "prefix/room_name/blind_name/set"
    this.client?.subscribe(`${this.mqttPrefix}/+/+/set`, { qos: 2 });

    const topics = [`${this.mqttPrefix}/refresh`].concat(
      Array.from(this.blindsById).map(([, blind]) => `${this.getMqttTopic(blind)}/set`),
    );

    logger.info("Registered topics: %o", topics);

    this.updateBlindsState();
  };

  private onMessage = (topic: string, message: Buffer) => {
    if (topic === `${this.mqttPrefix}/refresh`) {
      return this.updateBlindsState();
    }

    const [roomName, blindName, action] = topic.substring(this.mqttPrefix.length + 1).split("/");

    const blind = this.blindsByRoom.get(roomName)?.get(blindName);
    if (blind && action === "set") {
      const position = +message.toString();
      return this.queueBlindsUpdate({ blinds: [blind.id], position });
    }

    logger.warn("No handler for topic: %s", topic);
  };

  /**
   * Queue requests to update position so we can reduce the total number of service calls. This will
   * comebine separate requests for the same position into one call and ensure if requests for the same
   * blind are made quickly, the latest position will be used.
   */
  private queueBlindsUpdate = (request: QueuedBlindUpdate) => {
    this.updateQueue.add(request);

    if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        const requests = [...this.updateQueue];

        this.updateTimer = undefined;
        this.updateQueue.clear();

        // first iterate through the list to figure out the position each blind should get;
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
          this.setBlindsPosition(blinds, +position);
        });
      }, UPDATE_QUEUE_DELAY_MS);
    }
  };

  private setBlindsPosition = async (blindIds: Array<string>, position: number) => {
    logger.info("Processing request to update blinds position...");

    if (isNaN(position)) {
      logger.warn("Received invalid positon: %s; ignoring", position);
      return;
    }

    position = Math.max(0, Math.min(180, position));

    logger.info("Changing position to: %s for blinds: %s", position, blindIds.join(", "));
    const updatedBlinds = await this.api.updateTiltPosition(blindIds, position);

    updatedBlinds && this.publishStateChange(updatedBlinds);
  };

  private publishStateChange = (updatedBlinds: Array<BlindState>) => {
    updatedBlinds.forEach((blind) => {
      const position = blind.position < 4 ? 0 : blind.position > 176 ? 180 : blind.position;
      const state = position === 0 || position === 180 ? "closed" : "open";

      const blindEntry = this.blindsById.get(blind.id);

      if (!blindEntry) {
        logger.error("Ignoring update request received for an unknown blind: %s", blind);
        return;
      }

      const mqttTopic = this.getMqttTopic(blindEntry);

      this.client?.publish(`${mqttTopic}/state`, JSON.stringify({ ...blind, position, state }), { retain: true });
      this.client?.publish(`${mqttTopic}/position`, position.toString(), {
        retain: true,
      });
    });
  };

  private getMqttTopic = (blind: BlindInfo) => `${this.mqttPrefix}/${normalize(blind.room)}/${normalize(blind.name)}`;
}
