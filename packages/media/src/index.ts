export const mediaMustStream = true;
export {
  createMediaUploadGrant,
  type MediaUploadGrant,
  verifyMediaUploadGrant,
} from "./grant.js";
export {
  type AllowedMediaMime,
  allowedMediaMimes,
  maxBytesForMime,
  sniffMediaMime,
} from "./sniff.js";
export { storeMediaStream } from "./store.js";
