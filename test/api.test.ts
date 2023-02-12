import { jest } from "@jest/globals";
import nock from "nock";
import { AuthenticationClient } from "auth0";
import Api from "../src/api";
import {
  MOCK_BLIND_1,
  MOCK_BLIND_2,
  mockFindBlinds,
  mockGetBlindsState,
  MOCK_BLIND_STATE_1,
  MOCK_PASSWORD,
  MOCK_USERNAME,
  mockUpdateBlindsPosition,
  MOCK_TOKEN,
} from "./fixtures";

jest.mock("auth0");
const AuthenticationClientMock = AuthenticationClient as jest.Mocked<typeof AuthenticationClient>;

const mockLogin = () => {
  AuthenticationClientMock.prototype.passwordGrant.mockImplementation(() =>
    Promise.resolve({
      access_token: MOCK_TOKEN,
      id_token: MOCK_TOKEN,
      token_type: "Bearer",
      expires_in: 100,
    })
  );
};

const mockFailedLogin = () => {
  AuthenticationClientMock.prototype.passwordGrant.mockImplementation(() => Promise.reject("Mock auth failure"));
};

describe("Api", () => {
  let api: Api;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    AuthenticationClientMock.mockClear();

    api = new Api({
      username: MOCK_USERNAME,
      password: MOCK_PASSWORD,
    });
  });

  afterEach(() => {
    nock.restore();
  });

  describe("findBlinds", () => {
    it("should find blinds successfully", async () => {
      mockLogin();
      mockFindBlinds();

      const blinds = await api.findBlinds();

      expect(blinds).toEqual([
        expect.objectContaining({ name: MOCK_BLIND_1.name, room: "Office" }),
        expect.objectContaining({ name: MOCK_BLIND_2.name, room: "Office" }),
      ]);
    });

    it("should return null on failed login", async () => {
      mockFailedLogin();
      mockFindBlinds();

      const blinds = await api.findBlinds();

      expect(blinds).toBeNull();
    });
  });

  describe("getBlindsState", () => {
    it("should get blinds state successfully", async () => {
      mockLogin();
      mockGetBlindsState([MOCK_BLIND_1.encodedMacAddress]);

      const blinds = await api.getBlindsState([MOCK_BLIND_1.encodedMacAddress]);

      expect(blinds).toEqual([
        {
          id: MOCK_BLIND_STATE_1.encodedMacAddress,
          batteryLevel: MOCK_BLIND_STATE_1.batteryLevel,
          position: MOCK_BLIND_STATE_1.position,
          signalStrength: MOCK_BLIND_STATE_1.rssi,
        },
      ]);
    });

    it("should return null on failed login", async () => {
      mockFailedLogin();
      mockGetBlindsState([MOCK_BLIND_1.encodedMacAddress]);

      const blinds = await api.findBlinds();

      expect(blinds).toBeNull();
    });
  });

  describe("updateTiltPosition", () => {
    it("should return the updated blind state", async () => {
      const position = 99;
      const blindId = MOCK_BLIND_1.encodedMacAddress;
      mockLogin();
      mockUpdateBlindsPosition([blindId], position);

      const blinds = await api.updateTiltPosition([blindId], position);

      expect(blinds).toEqual([
        {
          id: blindId,
          batteryLevel: MOCK_BLIND_STATE_1.batteryLevel,
          position: position,
          signalStrength: MOCK_BLIND_STATE_1.rssi,
        },
      ]);
    });

    it("should return null on failed login", async () => {
      const position = 99;
      const blindId = MOCK_BLIND_1.encodedMacAddress;
      mockFailedLogin();
      mockUpdateBlindsPosition([blindId], position);

      const blinds = await api.updateTiltPosition([blindId], position);

      expect(blinds).toBeNull();
    });
  });
});
