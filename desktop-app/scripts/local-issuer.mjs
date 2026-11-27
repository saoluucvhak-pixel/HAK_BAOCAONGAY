// Provision the local HAK issuer and print only the public JWK for the installer build.
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, generateKeyPairSync, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const format = 'hak-issuer-key-v1';

function deriveKey(password, salt) {
  return pbkdf2Sync(password, salt, 600000, 32, 'sha256');
}

function createLocalIssuer(file, password) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const secret = privateKey.export({ type: 'pkcs8', format: 'der' });
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final(), cipher.getAuthTag()]);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({
      format, salt: salt.toString('base64'), iv: iv.toString('base64'), encrypted: encrypted.toString('base64')
    }), { flag: 'wx', mode: 0o600 });
    return publicKey;
  } finally {
    key.fill(0);
    secret.fill(0);
  }
}

function readLocalIssuer(data, password) {
  const stored = JSON.parse(data);
  if (stored?.format !== format) throw new Error('Định dạng khóa HAK không hợp lệ.');
  const salt = Buffer.from(stored.salt, 'base64');
  const iv = Buffer.from(stored.iv, 'base64');
  const encrypted = Buffer.from(stored.encrypted, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || encrypted.length <= 16) throw new Error('File khóa HAK bị lỗi.');
  const key = deriveKey(password, salt);
  let secret;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(encrypted.subarray(-16));
    secret = decipher.update(encrypted.subarray(0, -16));
    decipher.final(); // Authenticate the ciphertext before importing the private key.
    return createPublicKey(createPrivateKey({ key: secret, type: 'pkcs8', format: 'der' }));
  } catch {
    throw new Error('Sai mật khẩu hoặc file khóa HAK bị lỗi.');
  } finally {
    key.fill(0);
    secret?.fill(0);
  }
}

try {
  const file = process.argv[2];
  const password = process.env.HAK_LOCAL_ISSUER_PASSWORD;
  delete process.env.HAK_LOCAL_ISSUER_PASSWORD;
  if (!file || !password || password.length < 12) throw new Error('Mật khẩu khóa HAK cần ít nhất 12 ký tự.');

  let existing;
  try {
    existing = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const issuer = existing === undefined ? createLocalIssuer(file, password) : readLocalIssuer(existing, password);
  const { kty, n, e } = issuer.export({ format: 'jwk' });
  console.log(JSON.stringify({ kty, n, e }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
