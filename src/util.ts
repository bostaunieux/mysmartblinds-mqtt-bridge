import { BlindInfo, BlindState, GetUserInfo_User_Blind, UpdateBlindsPosition_Blind } from "./config";

export const formatBlindInfo = (blind: GetUserInfo_User_Blind, roomsById: Map<string, string>): BlindInfo => ({
  id: blind.encodedMacAddress,
  name: blind.name,
  room: roomsById.get(blind.roomId) ?? "unknown",
  batteryLevel: blind.batteryPercent,
});

export const formatBlindState = (blind: UpdateBlindsPosition_Blind): BlindState => ({
  id: blind.encodedMacAddress,
  // hub doesn't always report a battery level, so if it's 0, set a default low value
  // this eases integration with platforms like homebridge/home assistant that will complain
  // about low batteries
  batteryLevel: blind.batteryLevel == 0 ? 20 : blind.batteryLevel,
  signalStrength: blind.rssi,
  position: blind.position,
});
