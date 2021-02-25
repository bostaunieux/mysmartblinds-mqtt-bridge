import nock, { Scope } from "nock";
import { MUTATION_UPDATE_BLINDS_POSITION, QUERY_GET_BLINDS_STATE, QUERY_GET_USER_INFO } from "../src/config";

export const MOCK_USERNAME = "test-username";
export const MOCK_PASSWORD = "test-password";
export const MOCK_TOKEN = "test-token";

const LOGIN_REQUEST_BODY = {
  scope: "openid offline_access",
  grant_type: "password",
  client_id: "1d1c3vuqWtpUt1U577QX5gzCJZzm8WOB",
  connection: "Username-Password-Authentication",
  device: "MySmartBlinds MQTT",
  username: MOCK_USERNAME,
  password: MOCK_PASSWORD,
};

export const MOCK_BLIND_1 = {
  encodedMacAddress: "XX:XX:XX:XX",
  name: "One",
  deleted: false,
  encodedPasskey: "KEY-1",
  roomId: 12345,
  batteryPercent: 99,
};

export const MOCK_BLIND_STATE_1 = {
  encodedMacAddress: MOCK_BLIND_1.encodedMacAddress,
  batteryLevel: MOCK_BLIND_1.batteryPercent,
  rssi: -75,
  position: 0,
};

export const MOCK_BLIND_2 = {
  encodedMacAddress: "YY:YY:YY:YY",
  name: "Two",
  deleted: false,
  encodedPasskey: "KEY-2",
  roomId: 12345,
  batteryPercent: 99,
};

export const MOCK_BLIND_STATE_2 = {
  encodedMacAddress: MOCK_BLIND_2.encodedMacAddress,
  batteryLevel: MOCK_BLIND_2.batteryPercent,
  rssi: -65,
  position: 120,
};

export const mockLogin = (): Scope =>
  nock("https://mysmartblinds.auth0.com").post("/oauth/ro", LOGIN_REQUEST_BODY).reply(200, { id_token: MOCK_TOKEN });

export const mockFailedLogin = (): Scope =>
  nock("https://mysmartblinds.auth0.com").post("/oauth/ro", LOGIN_REQUEST_BODY).reply(200, {});

export const mockFindBlinds = (): Scope =>
  nock("https://api.mysmartblinds.com")
    .post("/v1/graphql", {
      query: QUERY_GET_USER_INFO,
      variables: null,
    })
    .reply(200, {
      data: {
        user: {
          rooms: [{ id: 12345, name: "Office", deleted: false }],
          blinds: [MOCK_BLIND_1, MOCK_BLIND_2],
        },
      },
    });

export const mockGetBlindsState = (requestedBlinds: Array<string>): Scope =>
  nock("https://api.mysmartblinds.com")
    .post("/v1/graphql", {
      query: QUERY_GET_BLINDS_STATE,
      variables: { blinds: requestedBlinds },
    })
    .reply(200, (uri, requestBody: Record<string, any>) => {
      const requestBlinds = requestBody.variables.blinds;
      const responseBlinds = [];
      requestBlinds.includes(MOCK_BLIND_1.encodedMacAddress) && responseBlinds.push(MOCK_BLIND_STATE_1);
      requestBlinds.includes(MOCK_BLIND_2.encodedMacAddress) && responseBlinds.push(MOCK_BLIND_STATE_2);
      return {
        data: {
          blindsState: responseBlinds,
        },
      };
    });

export const mockUpdateBlindsPosition = (requestedBlinds: Array<string>, requestedPosition: number): Scope =>
  nock("https://api.mysmartblinds.com")
    .post("/v1/graphql", {
      query: MUTATION_UPDATE_BLINDS_POSITION,
      variables: { blinds: requestedBlinds, position: requestedPosition },
    })
    .reply(200, (uri, requestBody: Record<string, any>) => {
      const { blinds, position } = requestBody.variables;
      const responseBlinds = [];
      blinds.includes(MOCK_BLIND_1.encodedMacAddress) && responseBlinds.push({ ...MOCK_BLIND_STATE_1, position });
      blinds.includes(MOCK_BLIND_2.encodedMacAddress) && responseBlinds.push({ ...MOCK_BLIND_STATE_2, position });
      return {
        data: {
          updateBlindsPosition: responseBlinds,
        },
      };
    });
