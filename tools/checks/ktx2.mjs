/** Validate KTX2 container ranges before reporting bytes. GPU transcoding stays in functional tests. */
export function validateKtx2(data) {
  const magic = 'ab4b5458203230bb0d0a1a0a';
  if (data.length < 80 || data.subarray(0, 12).toString('hex') !== magic) throw new Error('Invalid KTX2 header');
  const levels = data.readUInt32LE(40);
  if (!data.readUInt32LE(20) || !levels || 80 + levels * 24 > data.length) throw new Error('Invalid KTX2 level index');
  const range = (offset, length) => {
    if (offset < 0n || length <= 0n || offset + length > BigInt(data.length)) throw new Error('Truncated KTX2 payload');
  };
  range(BigInt(data.readUInt32LE(48)), BigInt(data.readUInt32LE(52)));
  const kvdLength = data.readUInt32LE(60);
  if (kvdLength) range(BigInt(data.readUInt32LE(56)), BigInt(kvdLength));
  const sgdLength = data.readBigUInt64LE(72);
  if (sgdLength) range(data.readBigUInt64LE(64), sgdLength);
  for (let level = 0; level < levels; level++) {
    const at = 80 + level * 24;
    range(data.readBigUInt64LE(at), data.readBigUInt64LE(at + 8));
  }
}
