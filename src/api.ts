import axios from "axios";
import { AuthenticationClient } from "auth0";
import {
  BlindInfo,
  BlindState,
  GetUserInfoResponse,
  MUTATION_UPDATE_BLINDS_POSITION,
  QUERY_GET_BLINDS_STATE,
  QUERY_GET_USER_INFO,
  UpdateBlindsResponse,
} from "./config";
import { formatBlindInfo, formatBlindState } from "./util";
import logger from "./logger";

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

const APP_USER_AGENT = "MySmartBlinds/1 CFNetwork/1404.0.5 Darwin/22.3.0";
export const APP_CLIENT_ID = "1d1c3vuqWtpUt1U577QX5gzCJZzm8WOB";

/**
 * MySmartBlinds hub connection
 */
export default class Api {
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
      logger.error("Failed finding available blinds: %o", error);
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
      logger.error("Failed getting blinds status: %o", error);
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
      logger.error("Failed updating blinds position: %o", error);
      return null;
    }
  }

  private async getToken(): Promise<string | null> {
    const now = new Date().getTime();

    if (this.storedToken?.expiry && this.storedToken.expiry > now) {
      logger.debug("Using existing auth token");
      return this.storedToken.id;
    }

    logger.info("Fetching new auth token...");

    const { id, expiry } = await this.requestAuth0Token();

    logger.info("Received new token with expiration: %s", new Date(expiry).toISOString());

    // store the newly fetched token
    this.storedToken = { id, expiry };

    return id;
  }

  private async requestAuth0Token(): Promise<TokenDetails> {
    const auth0 = new AuthenticationClient({
      domain: "mysmartblinds.auth0.com",
      clientId: APP_CLIENT_ID,
      clientSecret: "",
    });

    let response;
    try {
      response = await auth0.passwordGrant({
        username: this.username,
        password: this.password,
        realm: "Username-Password-Authentication",
        scope: "openid email offline_access",
      });
    } catch (e) {
      console.warn(`Failed to authenticate with error: ${e}`);
    }

    if (!response?.id_token || response?.token_type !== "Bearer") {
      throw new Error("Failed fetching auth token");
    }

    return {
      id: response.access_token,
      // token expires in 10 hours
      expiry: new Date().getTime() + 18 * 60 * 60 * 1000,
    };
  }

  private async requestBlindsState(blinds: Array<string>): Promise<Array<BlindState>> {
    logger.debug("Requesting blinds status...");

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

    logger.info("Received GetBlindsState response: %o", response.data);

    return response.data.data.blindsState.map(formatBlindState);
  }

  private async requestBlinds(): Promise<Array<BlindInfo>> {
    logger.debug("Looking up blinds...");

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

    logger.debug("Received GetUserInfo response: %o", response.data.data);

    const roomsById = (response.data.data?.user?.rooms ?? [])
      .filter((room) => !room.deleted)
      .reduce((rooms, room) => rooms.set(room.id, room.name), new Map<string, string>());

    const blinds = (response.data?.data?.user?.blinds ?? [])
      .filter((room) => !room.deleted)
      .map((blind) => formatBlindInfo(blind, roomsById));

    return blinds;
  }

  private async requestPositionUpdate(blinds: Array<string>, position: number): Promise<Array<BlindState>> {
    logger.debug("Requesting blind position update...");

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

    logger.debug("Received UpdateBlindsPosition response: %o", response.data.data);

    return response.data.data.updateBlindsPosition.map(formatBlindState);
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();

    return {
      Authorization: `Bearer ${token}`,
      "auth0-client-id": APP_CLIENT_ID,
      "User-Agent": APP_USER_AGENT,
      "Content-Type": "application/json",
    };
  }
}
