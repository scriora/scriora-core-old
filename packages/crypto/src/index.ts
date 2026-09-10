export type CipherRecord = {
  keyVersion: number;
  iv: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
};
