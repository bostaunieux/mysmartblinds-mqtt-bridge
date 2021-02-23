import axios from "axios";
import {
  BlindInfo,
  BlindState,
  MUTATION_UPDATE_BLINDS_POSITION,
  QUERY_GET_BLINDS_STATE,
  QUERY_GET_USER_INFO,
} from "./config";

interface ApiProps {
  /** mysmartblinds account username */
  username: string;
  /** mysmartblinds account password */
  password: string;
}

interface TokenDetails {
  /** token id */
  id: string;
  /** expiration timestamp */
  expiry: number;
}

// oauth signin response
interface SignInToken {
  id_token: string;
  scope: string;
  refresh_token: string;
  access_token: string;
  token_type: string;
}

interface UpdateBlindsResponseBlind {
  encodedMacAddress: string;
  batteryLevel: number;
  rssi: number;
  position: number;
}

interface UpdateBlindsPosition {
  updateBlindsPosition: Array<UpdateBlindsResponseBlind>;
}

interface UpdateBlindsResponse {
  data: UpdateBlindsPosition;
}

interface GetUserInfoRoom {
  id: string;
  name: string;
  deleted: boolean;
}

interface GetUserInfoBlind {
  name: string;
  encodedMacAddress: string;
  encodedPasskey: string;
  roomId: string;
  deleted: boolean;
  batteryPercent: number;
}

interface GetUserInfoUser {
  rooms: Array<GetUserInfoRoom>;
  blinds: Array<GetUserInfoBlind>;
}

interface GetUserInfo {
  user: GetUserInfoUser;
}

interface GetUserInfoResponse {
  data: GetUserInfo;
}

/**
 * MySmartBlinds hub connection
 */
export default class Api {
  private clientId: string = "1d1c3vuqWtpUt1U577QX5gzCJZzm8WOB";
  private username: string;
  private password: string;
  private storedToken?: TokenDetails;

  constructor({ username, password }: ApiProps) {
    this.username = username;
    this.password = password;
  }

  /**
   * Find all available blinds on MySmartBlinds account
   */
  public async findBlinds(): Promise<Array<BlindInfo> | null> {
    try {
      return await this.requestBlinds();
    } catch (error) {
      console.error("Failed finding available blinds", error);
      return null;
    }
  }

  /**
   * Get the current state of the requested blinds
   *
   * @param blinds blind ids
   */
  public async getBlindsState(blinds: Array<string>): Promise<Array<BlindState> | null> {
    try {
      return await this.requestBlindsState(blinds);
    } catch (error) {
      console.error("Failed getting blinds status", error);
      return null;
    }
  }

  /**
   * Set the tilt position to the provided blinds
   *
   * @param blinds blind ids
   * @param position numeric blind position from 0 to 100
   */
  public async updateTiltPosition(blinds: Array<string>, position: number): Promise<Array<BlindState> | null> {
    try {
      return await this.requestPositionUpdate(blinds, position);
    } catch (error) {
      console.error("Failed updating blinds position", error);
      return null;
    }
  }

  private async getToken(): Promise<string | null> {
    const now = new Date().getTime();

    if (this.storedToken?.expiry && this.storedToken.expiry > now) {
      console.info("Using existing auth token");
      return this.storedToken.id;
    }

    console.info("Fetching new auth token");

    const { id, expiry } = await this.requestAuth0Token();

    console.info("Received new token, valid until: %s", new Date(expiry).toISOString());

    // store the newly fetched token
    this.storedToken = { id, expiry };

    return id;
  }

  private async requestAuth0Token(): Promise<TokenDetails> {
    const response = await axios.post<SignInToken>(
      "https://mysmartblinds.auth0.com/oauth/ro",
      {
        scope: "openid offline_access",
        grant_type: "password",
        client_id: this.clientId,
        connection: "Username-Password-Authentication",
        device: "MySmartBlinds Homebridge",
        username: this.username,
        password: this.password,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.data?.id_token) {
      throw new Error("Failed fetching auth token");
    }

    return {
      id: response.data?.id_token,
      // token expires in 10 hours
      expiry: new Date().getTime() + 10 * 60 * 60 * 1000,
    };
  }

  private async requestBlindsState(blinds: Array<string>): Promise<Array<BlindState>> {
    console.debug("Requesting blinds status");

    const headers = await this.getHeaders();
    const requestConfig = { headers };

    const response = await axios.post(
      "https://api.mysmartblinds.com/v1/graphql",
      {
        query: QUERY_GET_BLINDS_STATE,
        variables: { blinds },
      },
      requestConfig
    );

    console.debug("GetBlindsState response: ", response.data);

    return this.formatBlindsResponse(response.data.data.blindsState);
  }

  private async requestBlinds(): Promise<Array<BlindInfo>> {
    console.debug("Searching for blinds");

    const headers = await this.getHeaders();
    const requestConfig = { headers };

    const response = await axios.post<GetUserInfoResponse>(
      "https://api.mysmartblinds.com/v1/graphql",
      {
        query: QUERY_GET_USER_INFO,
        variables: null,
      },
      requestConfig
    );

    const roomsById = new Map<string, string>();

    (response.data?.data?.user?.rooms || [])
      .filter((room) => !room.deleted)
      .reduce((acc, room) => {
        acc.set(room.id, room.name);
        return acc;
      }, roomsById);

    const blinds = (response.data?.data?.user?.blinds || [])
      .filter((room) => !room.deleted)
      .map((blind) => ({
        id: blind.encodedMacAddress,
        name: blind.name,
        encodedPasskey: blind.encodedPasskey,
        room: roomsById.get(blind.roomId) ?? "unknown",
        batteryLevel: blind.batteryPercent,
      }));

    console.debug("GetUserInfo blinds response:", blinds);

    return blinds;
  }

  private async requestPositionUpdate(blinds: Array<string>, position: number): Promise<Array<BlindState>> {
    const headers = await this.getHeaders();
    const requestConfig = { headers };

    const response = await axios.post<UpdateBlindsResponse>(
      "https://api.mysmartblinds.com/v1/graphql",
      {
        query: MUTATION_UPDATE_BLINDS_POSITION,
        variables: { position, blinds },
      },
      requestConfig
    );

    console.debug("UpdateBlindsPosition response: %s", response.data.data.updateBlindsPosition);

    return this.formatBlindsResponse(response.data.data.updateBlindsPosition);
  }

  private formatBlindsResponse(response: Array<UpdateBlindsResponseBlind>): Array<BlindState> {
    return response.map((blind) => ({
      id: blind.encodedMacAddress,
      batteryLevel: blind.batteryLevel == 0 ? 20 : blind.batteryLevel,
      signalStrength: blind.rssi,
      position: blind.position,
    }));
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();

    return {
      Authorization: `Bearer ${token}`,
      "auth0-client-id": this.clientId,
      "User-Agent": "MySmartBlinds/5 CFNetwork/1121.2.2 Darwin/19.3.0",
      "Content-Type": "application/json",
    };
  }
}
