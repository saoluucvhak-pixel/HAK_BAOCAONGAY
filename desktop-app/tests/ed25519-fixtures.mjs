import { createCipheriv, createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, sign, verify } from 'node:crypto';

export const product = 'com.hakgroup.baocaongay';
const encode = (data) => Buffer.from(data).toString('base64url');

export function newRequest(app = product) {
  const pair = generateKeyPairSync('x25519');
  return {
    privateKey: pair.privateKey,
    wire: 'HAK4.' + encode(JSON.stringify({
      product: app, machine: encode(randomBytes(16)), nonce: encode(randomBytes(16)),
      key: pair.publicKey.export({ format: 'jwk' }).x
    }))
  };
}

function derive(wire, privateKey, publicKey) {
  const shared = diffieHellman({
    privateKey, publicKey: createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: publicKey }, format: 'jwk' })
  });
  return Buffer.from(hkdfSync('sha256', shared, wire, 'hak-company-v4', 32));
}

export function response(issuer, wire) {
  return 'HAKA4.' + encode(sign(null, Buffer.from('hak-unlock-v4\n' + wire), issuer));
}

export function packSetup(issuer, wire, company, changes = {}) {
  const recipient = JSON.parse(Buffer.from(wire.slice(5), 'base64url'));
  const ephemeral = generateKeyPairSync('x25519');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(wire, ephemeral.privateKey, recipient.key), iv);
  cipher.setAAD(Buffer.from(wire));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(company)), cipher.final(), cipher.getAuthTag()]);
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = encode(JSON.stringify({
    request: wire, issuedAt, expiresAt: issuedAt + 86400, ephemeral: ephemeral.publicKey.export({ format: 'jwk' }).x,
    iv: encode(iv), ciphertext: encode(ciphertext), ...changes
  }));
  return {
    format: 'haksetup-ed25519-v4', body,
    signature: encode(sign(null, Buffer.from('hak-setup-v4\n' + body), issuer))
  };
}

export function openCompany(file, issuer, recipient) {
  const envelope = JSON.parse(file);
  if (envelope.format !== 'haksetup-ed25519-v4' ||
      !verify(null, Buffer.from('hak-setup-v4\n' + envelope.body), issuer, Buffer.from(envelope.signature, 'base64url')))
    throw new Error('Invalid signature');
  const setup = JSON.parse(Buffer.from(envelope.body, 'base64url'));
  if (setup.request !== recipient.wire) throw new Error('Wrong recipient');
  const ciphertext = Buffer.from(setup.ciphertext, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', derive(setup.request, recipient.privateKey, setup.ephemeral),
    Buffer.from(setup.iv, 'base64url'));
  decipher.setAAD(Buffer.from(setup.request));
  decipher.setAuthTag(ciphertext.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]));
}
