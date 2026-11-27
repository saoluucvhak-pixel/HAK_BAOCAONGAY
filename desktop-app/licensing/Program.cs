using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

internal static class Program
{
    private const string Product = "com.hakgroup.baocaongay";
    private const string RequestPrefix = "HAK-R1.";
    private const string ResponsePrefix = "HAK-A1.";
    private const string KeyName = "HAK BaoCaoNgay Device v1";
    private const int MaxFileBytes = 16384;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxFileBytes };
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    private static readonly string LicensePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HAK", "BaoCaoNgay", "license.haklic");

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var policy = ReadPolicy();
            if (args.Length == 1 && args[0] == "enroll")
            {
                try
                {
                    return ActivationDialog.Run(CreateRequestCode(policy), text => AcceptCode(text, policy),
                        file => AcceptFile(file, policy, true)) ? 0 : 1;
                }
                catch (Exception error)
                {
                    System.Windows.Forms.MessageBox.Show(
                        "Không tạo được mã yêu cầu trên máy này. Kiểm tra TPM và tài khoản Windows. " + error.Message,
                        "Kích hoạt HAK", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
                    return 1;
                }
            }
            if (args.Length == 2 && args[0] == "request-code")
            {
                File.WriteAllText(args[1], CreateRequestCode(policy), Utf8);
                return 0;
            }
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
                var blob = ReadLimited(LicensePath);
                var content = Utf8.GetString(blob);
                if (content.StartsWith(ResponsePrefix, StringComparison.Ordinal))
                    VerifyCode(content, policy);
                else
                {
                    var license = Verify(blob, policy);
                    if (license.company != null)
                        Console.WriteLine(Convert.ToBase64String(Utf8.GetBytes(Json.Serialize(license.company))));
                }
                return 0;
            }
            if (args.Length == 2 && (args[0] == "accept" || args[0] == "accept-kit"))
            {
                AcceptFile(args[1], policy, args[0] == "accept-kit");
                return 0;
            }
            if (args.Length == 2 && args[0] == "accept-code")
            {
                AcceptCode(Utf8.GetString(ReadLimited(args[1])), policy);
                return 0;
            }
            Console.Error.WriteLine("Usage: HAK-License request <file.hakreq> | accept <file.haklic> | accept-kit <file.haksetup> | check | enroll | request-code <file> | accept-code <file>");
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

    private static string CreateRequestCode(Policy policy)
    {
        using (var key = OpenDeviceKey(policy, true))
            return RequestPrefix + EncodeBase64Url(Convert.FromBase64String(DeviceFingerprint(key)));
    }

    private static string EncodeBase64Url(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
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

    private static void AcceptFile(string file, Policy policy, bool requireCompany)
    {
        var blob = ReadLimited(file);
        var license = Verify(blob, policy);
        if (requireCompany && license.company == null)
            throw new InvalidDataException("File này thiếu cấu hình công ty do HAK cấp.");
        SaveLicense(blob);
    }

    private static License Verify(byte[] blob, Policy policy)
    {
        var envelope = Json.Deserialize<Envelope>(Utf8.GetString(blob));
        var payload = Convert.FromBase64String(envelope.body);
        VerifyIssuerSignature(payload, Convert.FromBase64String(envelope.signature), policy);
        var license = Json.Deserialize<License>(Utf8.GetString(payload));
        VerifyDeviceAndValidity(license, policy);
        if (license.company != null) ValidateCompany(license.company);
        return license;
    }

    private static void ValidateCompany(Company profile)
    {
        if (string.IsNullOrWhiteSpace(profile.TenCty) || profile.TenCty.Length > 200)
            throw new InvalidDataException("Tên công ty trong file HAK không hợp lệ.");
        ValidateSource(profile.PhieuCan, "Phiếu cân", true);
        ValidateSource(profile.DNTT, "Đề nghị thanh toán", true);
        ValidateSource(profile.HDNCC, "Hợp đồng NCC", false);
        ValidateSource(profile.Hosokeo, "Hồ sơ keo", false);
    }

    private static void ValidateSource(string address, string label, bool required)
    {
        address = (address ?? "").Trim();
        if (!required && address.Length == 0) return;
        Uri url;
        if (address.Length > 2000 || address.IndexOfAny(new[] { '\'', '"', '`', '<', '>', '\\', '\r', '\n' }) >= 0 ||
            !Uri.TryCreate(address, UriKind.Absolute, out url) || url.Scheme != "https" ||
            url.Host != "docs.google.com" || !url.IsDefaultPort || !string.IsNullOrEmpty(url.UserInfo))
            throw new InvalidDataException(label + " cần liên kết Google Sheets CSV hợp lệ.");
        var query = System.Web.HttpUtility.ParseQueryString(url.Query);
        bool published = Regex.IsMatch(url.AbsolutePath, @"^/spreadsheets/d/e/[^/]+/pub/?$") && query.GetValues("output")?[0] == "csv";
        bool exported = Regex.IsMatch(url.AbsolutePath, @"^/spreadsheets/d/[^/]+/export/?$") && query.GetValues("format")?[0] == "csv";
        if (!published && !exported) throw new InvalidDataException(label + " cần liên kết xuất CSV.");
    }

    private static void VerifyIssuerSignature(byte[] payload, byte[] signature, Policy policy)
    {
        using (var issuer = new RSACng())
        {
            issuer.ImportParameters(new RSAParameters { Modulus = DecodeBase64Url(policy.n), Exponent = DecodeBase64Url(policy.e) });
            if (!issuer.VerifyData(payload, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
                throw new CryptographicException("Mã trả lời có chữ ký không hợp lệ hoặc đã bị thay đổi.");
        }
    }

    private static void AcceptCode(string text, Policy policy)
    {
        string code = Regex.Replace(text, @"\s+", "");
        VerifyCode(code, policy);
        SaveLicense(Utf8.GetBytes(code));
    }

    private static void VerifyCode(string code, Policy policy)
    {
        if (code.Length > 4096 || !code.StartsWith(ResponsePrefix, StringComparison.Ordinal))
            throw new InvalidDataException("Hãy dán đầy đủ mã trả lời bắt đầu bằng HAK-A1.");
        var parts = code.Split('.');
        if (parts.Length != 3 || string.IsNullOrEmpty(parts[1]) || string.IsNullOrEmpty(parts[2]))
            throw new InvalidDataException("Mã trả lời HAK thiếu một phần.");
        try
        {
            var body = DecodeBase64Url(parts[1]);
            var signature = DecodeBase64Url(parts[2]);
            if (body.Length != 48 || EncodeBase64Url(body) != parts[1] || EncodeBase64Url(signature) != parts[2])
                throw new InvalidDataException("Mã trả lời HAK không đúng định dạng.");
            VerifyIssuerSignature(Utf8.GetBytes(Product + "\n" + ResponsePrefix + parts[1]), signature, policy);
            using (var reader = new BinaryReader(new MemoryStream(body)))
            {
                var license = new License
                {
                    product = Product, version = 1, issuedAt = reader.ReadInt64(), expiresAt = reader.ReadInt64(),
                    device = Convert.ToBase64String(reader.ReadBytes(32))
                };
                VerifyDeviceAndValidity(license, policy);
            }
        }
        catch (FormatException)
        {
            throw new InvalidDataException("Mã trả lời HAK không đúng định dạng.");
        }
    }

    private static void VerifyDeviceAndValidity(License license, Policy policy)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (license.product != Product || license.version != 1 || license.issuedAt > now ||
            license.expiresAt <= now || license.expiresAt <= license.issuedAt)
            throw new InvalidDataException("Giấy phép đã hết hạn, chưa có hiệu lực hoặc thuộc sản phẩm khác.");
        using (var key = OpenDeviceKey(policy, false))
        {
            if (license.device != DeviceFingerprint(key))
                throw new CryptographicException("Mã trả lời này thuộc máy hoặc tài khoản Windows khác.");
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
    public sealed class Company
    {
        public string TenCty { get; set; }
        public string DiaChi { get; set; }
        public string MST { get; set; }
        public string SDT { get; set; }
        public string MaHS { get; set; }
        public string NhaMay { get; set; }
        public string DiaChiThuMua { get; set; }
        public string PhieuCan { get; set; }
        public string DNTT { get; set; }
        public string HDNCC { get; set; }
        public string Hosokeo { get; set; }
    }
    public sealed class License
    {
        public string product { get; set; }
        public int version { get; set; }
        public string device { get; set; }
        public long issuedAt { get; set; }
        public long expiresAt { get; set; }
        public Company company { get; set; }
    }
}
