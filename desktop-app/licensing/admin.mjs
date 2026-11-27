import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const product = 'com.hakgroup.baocaongay';
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'keygen' && args.length === 2) {
    const [privatePath, publicPath] = args;
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
    writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
    writeFileSync(publicPath, JSON.stringify(publicKey.export({ format: 'jwk' })), { flag: 'wx' });
  } else if (command === 'issue' && (args.length === 5 || args.length === 6)) {
    const [privatePath, requestFile, output, asset, expires, qa] = args;
    const request = JSON.parse(readFileSync(requestFile, 'utf8'));
    const provider = qa === '--qa' && process.env.GITHUB_ACTIONS === 'true'
      ? 'Microsoft Software Key Storage Provider' : 'Microsoft Platform Crypto Provider';
    if (request.product !== product || request.provider !== provider ||
        typeof request.device !== 'string' || Buffer.from(request.device, 'base64').length !== 32 ||
        Buffer.from(request.device, 'base64').toString('base64') !== request.device)
      throw new Error('Yêu cầu đăng ký thiết bị hoặc nhà cung cấp khóa không hợp lệ.');
    const issuedAt = Math.floor(Date.now() / 1000);
    const end = new Date(expires + 'T23:59:59+07:00');
    const expiresAt = Math.floor(end.getTime() / 1000);
    if (!asset.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(expires) || !Number.isFinite(expiresAt) ||
        new Date(end.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== expires || expiresAt <= issuedAt)
      throw new Error('Cần mã tài sản và ngày hết hạn hợp lệ trong tương lai (YYYY-MM-DD, giờ Việt Nam).');
    const privateKey = createPrivateKey(readFileSync(privatePath));
    if (createPublicKey(privateKey).asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength < 3072)
      throw new Error('Cần khóa cấp phép RSA 3072 bit hoặc lớn hơn.');
    const id = randomUUID();
    const payload = Buffer.from(JSON.stringify({
      product, version: 1, id, asset: asset.trim(), device: request.device, issuedAt, expiresAt
    }));
    const signature = sign('sha256', payload, privateKey);
    writeFileSync(output, JSON.stringify({ body: payload.toString('base64'), signature: signature.toString('base64') }), { flag: 'wx' });
    console.log('Đã cấp giấy phép ' + id + ' cho ' + asset.trim() + ', hết hạn ' + expires + '.');
  } else {
    throw new Error('Dùng: admin.mjs keygen <private.pem> <public.jwk> hoặc issue <private.pem> <request.hakreq> <license.haklic> <mã máy> <YYYY-MM-DD>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
