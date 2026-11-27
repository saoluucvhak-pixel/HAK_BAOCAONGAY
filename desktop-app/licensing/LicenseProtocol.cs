using System;
using System.IO;
using System.Management;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using Org.BouncyCastle.Crypto.Digests;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Modes;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;
using Org.BouncyCastle.Security;

internal static class LicenseProtocol
{
    internal const string Product = "com.hakgroup.baocaongay";
    internal const string FileFormat = "haksetup-ed25519-v4";
    private const string RequestPrefix = "HAK4.";
    private const string ResponsePrefix = "HAKA4.";
    private const string SetupDomain = "hak-setup-v4\n";
    private const string UnlockDomain = "hak-unlock-v4\n";
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536 };

    internal static Session NewSession()
    {
        var random = new SecureRandom();
        var privateKey = new X25519PrivateKeyParameters(random);
        var nonce = new byte[16];
        random.NextBytes(nonce);
        var request = new Request
        {
            product = Product, machine = MachineIdentity.Fingerprint.Value, nonce = Encode(nonce),
            key = Encode(privateKey.GeneratePublicKey().GetEncoded())
        };
        return new Session
        {
            wire = RequestPrefix + Encode(Utf8.GetBytes(Json.Serialize(request))),
            secret = Encode(privateKey.GetEncoded())
        };
    }

    internal static void VerifyResponse(string response, string issuer, Session session)
    {
        if (!response.StartsWith(ResponsePrefix, StringComparison.Ordinal))
            throw new InvalidDataException("Dán mã phản hồi HAKA4 do HAK cấp.");
        VerifySignature(issuer, UnlockDomain + session.wire, Decode(response.Substring(ResponsePrefix.Length), 64));
    }

    internal static Program.License OpenSetup(byte[] file, string issuer, Session session, string machine)
    {
        var envelope = Json.Deserialize<Envelope>(Utf8.GetString(file));
        if (envelope?.format != FileFormat || string.IsNullOrEmpty(envelope.body))
            throw new InvalidDataException("Chọn file .haksetup do HAK cấp cho bản này.");

        VerifySignature(issuer, SetupDomain + envelope.body, Decode(envelope.signature, 64));
        var setup = Json.Deserialize<Setup>(Utf8.GetString(Decode(envelope.body)));
        if (setup == null || !string.Equals(setup.request, session.wire, StringComparison.Ordinal))
            throw new InvalidDataException("File phản hồi thuộc mã yêu cầu khác.");

        var request = ReadRequest(session.wire);
        if (request.product != Product || request.machine != machine)
            throw new InvalidDataException("Giấy phép thuộc ứng dụng hoặc thiết bị khác.");

        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (setup.issuedAt > now || setup.expiresAt <= now || setup.expiresAt <= setup.issuedAt)
            throw new InvalidDataException("Giấy phép đã hết hạn hoặc chưa có hiệu lực.");

        var privateKey = new X25519PrivateKeyParameters(Decode(session.secret, 32), 0);
        if (request.key != Encode(privateKey.GeneratePublicKey().GetEncoded()))
            throw new InvalidDataException("Thông tin kích hoạt trên máy không hợp lệ.");

        var shared = new byte[32];
        var key = new byte[32];
        try
        {
            privateKey.GenerateSecret(new X25519PublicKeyParameters(Decode(setup.ephemeral, 32), 0), shared, 0);
            var context = Utf8.GetBytes(session.wire);
            var kdf = new HkdfBytesGenerator(new Sha256Digest());
            kdf.Init(new HkdfParameters(shared, context, Utf8.GetBytes("hak-company-v4")));
            kdf.GenerateBytes(key, 0, key.Length);
            var cipher = new GcmBlockCipher(new AesEngine());
            cipher.Init(false, new AeadParameters(new KeyParameter(key), 128, Decode(setup.iv, 12), context));
            var encrypted = Decode(setup.ciphertext);
            if (encrypted.Length < 16) throw new InvalidDataException("File phản hồi thiếu cấu hình mã hóa.");
            var plaintext = new byte[cipher.GetOutputSize(encrypted.Length)];
            int count = cipher.ProcessBytes(encrypted, 0, encrypted.Length, plaintext, 0);
            count += cipher.DoFinal(plaintext, count);
            return new Program.License { company = Json.Deserialize<Program.Company>(Utf8.GetString(plaintext, 0, count)) };
        }
        finally
        {
            Array.Clear(key, 0, key.Length);
            Array.Clear(shared, 0, shared.Length);
        }
    }

    private static Request ReadRequest(string wire)
    {
        if (wire == null || wire.Length > 1024 || !wire.StartsWith(RequestPrefix, StringComparison.Ordinal))
            throw new InvalidDataException("Mã yêu cầu HAK không hợp lệ.");
        var request = Json.Deserialize<Request>(Utf8.GetString(Decode(wire.Substring(RequestPrefix.Length))));
        if (request == null) throw new InvalidDataException("Mã yêu cầu HAK không hợp lệ.");
        Decode(request.nonce, 16);
        Decode(request.key, 32);
        return request;
    }

    private static void VerifySignature(string issuer, string message, byte[] signature)
    {
        var verifier = new Ed25519Signer();
        verifier.Init(false, new Ed25519PublicKeyParameters(Decode(issuer, 32), 0));
        var bytes = Utf8.GetBytes(message);
        verifier.BlockUpdate(bytes, 0, bytes.Length);
        if (!verifier.VerifySignature(signature))
            throw new InvalidDataException("Phản hồi thiếu chữ ký hợp lệ của HAK hoặc đã bị sửa.");
    }

    internal static string Encode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static byte[] Decode(string text, int length = 0)
    {
        if (string.IsNullOrEmpty(text) || !Regex.IsMatch(text, @"\A[A-Za-z0-9_-]+\z"))
            throw new InvalidDataException("Dữ liệu cấp phép HAK không hợp lệ.");
        string base64 = text.Replace('-', '+').Replace('_', '/');
        var bytes = Convert.FromBase64String(base64.PadRight((base64.Length + 3) / 4 * 4, '='));
        if ((length != 0 && bytes.Length != length) || Encode(bytes) != text)
            throw new InvalidDataException("Dữ liệu cấp phép HAK không hợp lệ.");
        return bytes;
    }

    public sealed class Session { public string wire { get; set; } public string secret { get; set; } }
    public sealed class Request
    {
        public string product { get; set; }
        public string machine { get; set; }
        public string nonce { get; set; }
        public string key { get; set; }
    }
    public sealed class Envelope { public string format { get; set; } public string body { get; set; } public string signature { get; set; } }
    public sealed class Setup
    {
        public string request { get; set; }
        public long issuedAt { get; set; }
        public long expiresAt { get; set; }
        public string ephemeral { get; set; }
        public string iv { get; set; }
        public string ciphertext { get; set; }
    }
}

internal static class MachineIdentity
{
    internal static readonly Lazy<string> Fingerprint = new Lazy<string>(ReadFingerprint);

    private static string ReadFingerprint()
    {
        string machine;
        using (var registry = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
        using (var key = registry.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
            machine = Normalize(key?.GetValue("MachineGuid") as string);
        if (machine == null) throw new InvalidDataException("Không đọc được định danh Windows của máy.");

        var serial = ReadSerial("SELECT SerialNumber FROM Win32_BaseBoard", "SerialNumber")
            ?? ReadSerial("SELECT UUID FROM Win32_ComputerSystemProduct", "UUID")
            ?? ReadSerial("SELECT SerialNumber FROM Win32_DiskDrive WHERE Index = 0", "SerialNumber")
            ?? "";
        using (var sha = SHA256.Create())
        {
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes("hak-device-v1\n" + machine + "\n" + serial));
            var shortHash = new byte[16];
            Array.Copy(hash, shortHash, shortHash.Length);
            return LicenseProtocol.Encode(shortHash);
        }
    }

    private static string ReadSerial(string query, string field)
    {
        try
        {
            using (var search = new ManagementObjectSearcher(new ManagementScope(), new ObjectQuery(query),
                new EnumerationOptions { ReturnImmediately = true, Timeout = TimeSpan.FromSeconds(2) }))
            using (var results = search.Get())
            {
                foreach (ManagementBaseObject row in results)
                {
                    using (row)
                    {
                        var value = Normalize(row[field] as string);
                        if (value != null) return value;
                    }
                }
            }
        }
        catch (Exception error) when (error is ManagementException || error is UnauthorizedAccessException ||
            error is System.Runtime.InteropServices.COMException) { }
        return null;
    }

    private static string Normalize(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim().ToUpperInvariant();
        if (Regex.IsMatch(value, @"\A(?:0+|F+|[0-]+|[F-]+|DEFAULT STRING|TO BE FILLED BY O\.?E\.?M\.?|UNKNOWN|NONE|NOT SPECIFIED|SYSTEM SERIAL NUMBER)\z"))
            return null;
        return value;
    }
}
