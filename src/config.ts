export interface BlindState {
  id: string;
  batteryLevel: number;
  signalStrength: number;
  position: number;
}

export interface BlindInfo {
  name: string;
  id: string;
  encodedPasskey: string;
  room: string;
  batteryLevel: number;
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
            encodedPasskey
            roomId
            deleted
            batteryPercent
        }
    }
}
`;
