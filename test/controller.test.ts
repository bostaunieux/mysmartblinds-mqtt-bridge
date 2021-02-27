import mqtt, { Client, IStream, MqttClient } from "mqtt";
import Api from "../src/api";
import Controller, { UPDATE_QUEUE_DELAY_MS } from "../src/controller";
import { formatBlindInfo, formatBlindState } from "../src/util";
import {
  MOCK_BLIND_1,
  MOCK_BLIND_2,
  MOCK_BLIND_STATE_1,
  MOCK_BLIND_STATE_2,
  MOCK_PASSWORD,
  MOCK_ROOM,
  MOCK_USERNAME,
} from "./fixtures";

jest.useFakeTimers();
jest.mock("mqtt");
jest.mock("../src/api");

const mqttMock = mqtt as jest.Mocked<typeof mqtt>;
const ClientMock = Client as jest.MockedClass<typeof Client>;
const ApiMock = Api as jest.MockedClass<typeof Api>;

const TEST_HOST = "mqtt://localhost";

describe("Controller", () => {
  let controller: Controller;
  let api: Api;

  beforeEach(() => {
    ApiMock.mockClear();
    ClientMock.mockClear();
    mqttMock.connect.mockClear();

    const rooms = new Map([[MOCK_ROOM.id, MOCK_ROOM.name]]);
    ApiMock.prototype.findBlinds.mockResolvedValue([
      formatBlindInfo(MOCK_BLIND_1, rooms),
      formatBlindInfo(MOCK_BLIND_2, rooms),
    ]);

    const iStreamMock: IStream = (jest.fn() as unknown) as IStream;
    mqttMock.connect.mockReturnValue(new ClientMock(() => iStreamMock, {}));

    api = new Api({ username: MOCK_USERNAME, password: MOCK_PASSWORD });
    controller = new Controller({ api, mqttHost: TEST_HOST, mqttPrefix: "prefix" });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      jest.spyOn(controller, "updateAvailableBlinds");

      await expect(controller.initialize()).resolves.toBeUndefined();

      expect(mqttMock.connect).toHaveBeenCalledWith(TEST_HOST, expect.any(Object));
      expect(ClientMock).toHaveBeenCalledTimes(1);
      expect(ApiMock.mock.instances[0].findBlinds).toHaveBeenCalledTimes(1);
      expect(ClientMock.mock.instances[0].on).toHaveBeenCalledWith("connect", expect.any(Function));
      expect(ClientMock.mock.instances[0].on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(controller.updateAvailableBlinds).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateAvailableBlinds", () => {
    it("should find available blinds", async () => {
      await expect(controller.updateAvailableBlinds()).resolves.toBeUndefined();

      expect(controller.blindsById.has(MOCK_BLIND_1.encodedMacAddress)).toBe(true);
      expect(controller.blindsById.has(MOCK_BLIND_2.encodedMacAddress)).toBe(true);
      expect(controller.blindsByRoom.has(MOCK_ROOM.name.toLowerCase())).toBe(true);
    });

    it("should throw an error if no blinds are found", async () => {
      ApiMock.prototype.findBlinds.mockClear();
      ApiMock.prototype.findBlinds.mockResolvedValue([]);

      await expect(controller.updateAvailableBlinds()).rejects.toThrow("Did not find any blinds");
    });
  });

  describe("updateBlindsState", () => {
    beforeEach(() => {
      ApiMock.prototype.getBlindsState.mockResolvedValue([
        formatBlindState(MOCK_BLIND_STATE_1),
        formatBlindState(MOCK_BLIND_STATE_2),
      ]);
    });

    it("should find available blinds", async () => {
      // @ts-expect-error access private method
      jest.spyOn(controller, "publishStateChange");

      await controller.initialize();
      await expect(controller.updateBlindsState()).resolves.toBeUndefined();

      expect(api.getBlindsState).toHaveBeenCalledWith([
        MOCK_BLIND_STATE_1.encodedMacAddress,
        MOCK_BLIND_STATE_2.encodedMacAddress,
      ]);
      // @ts-expect-error access private method
      expect(controller.publishStateChange).toHaveBeenCalledWith([
        formatBlindState(MOCK_BLIND_STATE_1),
        formatBlindState(MOCK_BLIND_STATE_2),
      ]);
    });
  });

  describe("onConnect", () => {
    it("should initialize successfully", async () => {
      jest.spyOn(controller, "updateBlindsState");

      await controller.initialize();
      // @ts-expect-error access private class method
      controller.onConnect();

      expect(MqttClient.prototype.publish).toHaveBeenCalledWith("prefix/availability", "online", expect.any(Object));
      expect(MqttClient.prototype.subscribe).toHaveBeenCalledWith("prefix/refresh");
      expect(MqttClient.prototype.subscribe).toHaveBeenCalledWith("prefix/+/+/set", expect.any(Object));
      expect(controller.updateBlindsState).toHaveBeenCalledTimes(1);
    });
  });

  describe("onMessage", () => {
    beforeEach(() => {
      // @ts-expect-error access private method
      jest.spyOn(controller, "queueBlindsUpdate");
      jest.spyOn(controller, "updateBlindsState");

      ApiMock.prototype.updateTiltPosition.mockResolvedValue([formatBlindState(MOCK_BLIND_STATE_1)]);
    });

    it("should do nothing when processing an invalid message", async () => {
      await controller.initialize();
      // @ts-expect-error access private class method
      controller.onMessage("");

      // @ts-expect-error access private method
      expect(controller.queueBlindsUpdate).not.toHaveBeenCalled();
      expect(controller.updateBlindsState).not.toHaveBeenCalled();
    });

    it("should request blinds state update on refresh topic", async () => {
      await controller.initialize();
      // @ts-expect-error access private class method
      controller.onMessage("prefix/refresh");

      // @ts-expect-error access private method
      expect(controller.queueBlindsUpdate).not.toHaveBeenCalled();
      expect(controller.updateBlindsState).toHaveBeenCalledTimes(1);
    });

    it("should queue blinds update on update topic", async () => {
      await controller.initialize();
      // @ts-expect-error access private class method
      controller.onMessage("prefix/office/one/set", Buffer.from("99"));

      // @ts-expect-error access private method
      expect(controller.queueBlindsUpdate).toHaveBeenCalledWith({
        blinds: [MOCK_BLIND_1.encodedMacAddress],
        position: 99,
      });
      expect(api.updateTiltPosition).not.toHaveBeenCalled();

      jest.advanceTimersByTime(UPDATE_QUEUE_DELAY_MS);

      expect(api.updateTiltPosition).toHaveBeenCalledWith([MOCK_BLIND_1.encodedMacAddress], 99);
    });

    it("should batch multiple queued blind updates on update topic", async () => {
      await controller.initialize();
      // @ts-expect-error access private class method
      controller.onMessage("prefix/office/one/set", Buffer.from("99"));
      // @ts-expect-error access private class method
      controller.onMessage("prefix/office/one/set", Buffer.from("100"));
      // @ts-expect-error access private class method
      controller.onMessage("prefix/office/two/set", Buffer.from("100"));

      expect(api.updateTiltPosition).not.toHaveBeenCalled();

      jest.advanceTimersByTime(UPDATE_QUEUE_DELAY_MS);

      expect(api.updateTiltPosition).toHaveBeenCalledTimes(1);
      expect(api.updateTiltPosition).toHaveBeenCalledWith(
        [MOCK_BLIND_1.encodedMacAddress, MOCK_BLIND_2.encodedMacAddress],
        100
      );
    });

    it("should not update tilt position with invalid position on update topic", async () => {
      await controller.initialize();
      // @ts-expect-error access private class method
      controller.onMessage("prefix/office/one/set", Buffer.from("INVALID_POSITION"));

      jest.advanceTimersByTime(UPDATE_QUEUE_DELAY_MS);

      expect(api.updateTiltPosition).not.toHaveBeenCalled();
    });
  });
});
