export interface BlindState {
  /** unique blind identifier; encoded mac address */
  id: string;
  /** battery percentage, 0 - 100 */
  batteryLevel: number;
  /** rssi value */
  signalStrength: number;
  /** tilt position of blind  */
  position: number;
}

export interface BlindInfo {
  /** unique blind identifier; encoded mac address */
  id: string;
  /** blind name configured in app */
  name: string;
  /** name of room where blind resides */
  room: string;
  /** battery percentage, 0 - 100 */
  batteryLevel: number;
}

export interface UpdateBlindsPosition_Blind {
  encodedMacAddress: string;
  batteryLevel: number;
  rssi: number;
  position: number;
}

interface UpdateBlindsPosition {
  updateBlindsPosition: Array<UpdateBlindsPosition_Blind>;
}

export interface UpdateBlindsResponse {
  data: UpdateBlindsPosition;
}

interface GetUserInfo_User_Room {
  id: string;
  name: string;
  deleted: boolean;
}

export interface GetUserInfo_User_Blind {
  name: string;
  encodedMacAddress: string;
  roomId: string;
  deleted: boolean;
  batteryPercent: number;
}

interface GetUserInfo_User {
  rooms: Array<GetUserInfo_User_Room>;
  blinds: Array<GetUserInfo_User_Blind>;
}

interface GetUserInfo {
  user: GetUserInfo_User;
}

export interface GetUserInfoResponse {
  data: GetUserInfo;
}

export const MUTATION_UPDATE_BLINDS_POSITION = `
mutation UpdateBlindsPosition($blinds: [String], $position: Int!) {
    updateBlindsPosition(encodedMacAddresses: $blinds, position: $position) {
        __typename
        encodedMacAddress
        position
        rssi
        batteryLevel
    }
}
`;

export const QUERY_GET_BLINDS_STATE = `
query GetBlindsState($blinds: [String]) {
    blindsState(encodedMacAddresses: $blinds) {
        __typename
        encodedMacAddress
        position
        rssi
        batteryLevel
    }
}                         
`;

export const QUERY_GET_USER_INFO = `
query GetUserInfo {
    user {
        rooms {
            id
            name
            deleted
        }
        blinds {
            name
            encodedMacAddress
            roomId
            deleted
            batteryPercent
        }
    }
}
`;
