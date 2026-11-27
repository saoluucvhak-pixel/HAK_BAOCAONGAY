using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

internal static class Program
{
    private const string Product = "com.hakgroup.baocaongay";
    private const string KeyName = "HAK BaoCaoNgay Device v1";
    private const int MaxFileBytes = 16384;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxFileBytes };
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    private static readonly string LicensePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HAK", "BaoCaoNgay", "license.haklic");

    private static int Main(string[] args)
    {
        try
        {
            var policy = ReadPolicy();
            if (args.Length == 2 && args[0] == "request")
            {
                using (var key = OpenDeviceKey(policy, true))
                {
                    var request = new Request { product = Product, device = DeviceFingerprint(key), provider = key.Provider.Provider };
                    File.WriteAllText(args[1], Json.Serialize(request), Utf8);
                }
                return 0;
            }

            if (args.Length == 1 && args[0] == "check")
            {
                Verify(ReadLimited(LicensePath), policy);
                return 0;
            }
            if (args.Length == 2 && args[0] == "accept")
            {
                var blob = ReadLimited(args[1]);
                Verify(blob, policy);
                SaveLicense(blob);
                return 0;
            }
            Console.Error.WriteLine("Usage: HAK-License request <file.hakreq> | accept <file.haklic> | check");
            return 2;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    private static Policy ReadPolicy()
    {
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("hak-license-policy.json"))
        {
            if (resource == null) throw new InvalidDataException("HAK issuer policy is missing.");
            using (var reader = new StreamReader(resource, Utf8))
                return Json.Deserialize<Policy>(reader.ReadToEnd());
        }
    }

    private static CngKey OpenDeviceKey(Policy policy, bool create)
    {
        var provider = policy.qa ? CngProvider.MicrosoftSoftwareKeyStorageProvider : new CngProvider("Microsoft Platform Crypto Provider");
        var name = policy.qa ? KeyName + " QA" : KeyName;
        if (CngKey.Exists(name, provider)) return CngKey.Open(name, provider);
        if (!create) throw new CryptographicException("HAK device key not found. Register this Windows account on this device.");
        var parameters = new CngKeyCreationParameters
        {
            Provider = provider, ExportPolicy = CngExportPolicies.None, KeyUsage = CngKeyUsages.Signing
        };
        parameters.Parameters.Add(new CngProperty("Length", BitConverter.GetBytes(2048), CngPropertyOptions.None));
        return CngKey.Create(CngAlgorithm.Rsa, name, parameters);
    }

    private static string DeviceFingerprint(CngKey key)
    {
        using (var digest = SHA256.Create())
            return Convert.ToBase64String(digest.ComputeHash(key.Export(CngKeyBlobFormat.GenericPublicBlob)));
    }

    private static byte[] DecodeBase64Url(string text)
    {
        text = text.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(text.PadRight((text.Length + 3) / 4 * 4, '='));
    }

    private static byte[] ReadLimited(string file)
    {
        using (var stream = File.OpenRead(file))
        {
            if (stream.Length <= 0 || stream.Length > MaxFileBytes)
                throw new InvalidDataException("Invalid HAK license file length.");
            using (var reader = new BinaryReader(stream))
                return reader.ReadBytes((int)stream.Length);
        }
    }

    private static void Verify(byte[] blob, Policy policy)
    {
        var envelope = Json.Deserialize<Envelope>(Utf8.GetString(blob));
        var payload = Convert.FromBase64String(envelope.body);
        using (var issuer = new RSACng())
        {
            issuer.ImportParameters(new RSAParameters { Modulus = DecodeBase64Url(policy.n), Exponent = DecodeBase64Url(policy.e) });
            if (!issuer.VerifyData(payload, Convert.FromBase64String(envelope.signature), HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1)) throw new CryptographicException("Invalid HAK issuer signature.");
        }
        var license = Json.Deserialize<License>(Utf8.GetString(payload));
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (license.product != Product || license.version != 1 || license.issuedAt > now ||
            license.expiresAt <= now || license.expiresAt <= license.issuedAt)
            throw new InvalidDataException("HAK license is expired, not active or for another product.");
        using (var key = OpenDeviceKey(policy, false))
        {
            if (license.device != DeviceFingerprint(key))
                throw new CryptographicException("HAK license belongs to a different device key.");
            var challenge = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(challenge);
            using (var rsa = new RSACng(key))
            {
                var response = rsa.SignData(challenge, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                if (!rsa.VerifyData(challenge, response, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
                    throw new CryptographicException("Cannot prove possession of the HAK device key.");
            }
        }
    }

    private static void SaveLicense(byte[] blob)
    {
        string directory = Path.GetDirectoryName(LicensePath);
        Directory.CreateDirectory(directory);
        string temp = Path.Combine(directory, Path.GetRandomFileName());
        try
        {
            File.WriteAllBytes(temp, blob);
            if (File.Exists(LicensePath)) File.Replace(temp, LicensePath, null);
            else File.Move(temp, LicensePath);
        }
        finally { File.Delete(temp); }
    }

    public sealed class Policy { public string n { get; set; } public string e { get; set; } public bool qa { get; set; } }
    public sealed class Request { public string product { get; set; } public string device { get; set; } public string provider { get; set; } }
    public sealed class Envelope { public string body { get; set; } public string signature { get; set; } }
    public sealed class License
    {
        public string product { get; set; }
        public int version { get; set; }
        public string device { get; set; }
        public long issuedAt { get; set; }
        public long expiresAt { get; set; }
    }
}
