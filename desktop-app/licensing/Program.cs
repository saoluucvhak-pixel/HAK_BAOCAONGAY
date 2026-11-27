using System;
using System.IO;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

internal static class Program
{
    private const string Product = "com.hakgroup.baocaongay";
    private const uint RequestRange = 100000000;
    private const ulong ResponseRange = 1000000000000;
    private static readonly byte[] StateContext = Encoding.UTF8.GetBytes(Product);
    private const int MaxFileBytes = 16384;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxFileBytes * 2 };
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
                    var request = NewRequest();
                    return ActivationDialog.Run(request, text => AcceptCode(text, policy, request),
                        file => AcceptFile(file, policy, request, true)) ? 0 : 1;
                }
                catch (Exception error)
                {
                    System.Windows.Forms.MessageBox.Show(
                        "Không tạo được mã yêu cầu trên máy này. " + error.Message,
                        "Kích hoạt HAK", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
                    return 1;
                }
            }

            if (args.Length == 1 && args[0] == "check")
            {
                var installed = ReadInstalledAuthorization();
                var authorization = Convert.FromBase64String(installed.authorization);
                var request = installed.request;
                var content = Utf8.GetString(authorization);
                if (Regex.IsMatch(content, @"\A[0-9]{12}\z"))
                    VerifyCode(content, policy, request);
                else
                {
                    var license = Verify(authorization, policy, request);
                    if (license.company != null)
                        Console.WriteLine(Convert.ToBase64String(Utf8.GetBytes(Json.Serialize(license.company))));
                }
                return 0;
            }
            if (args.Length == 2 && args[0] == "accept-kit")
            {
                var installed = ReadInstalledAuthorization();
                AcceptFile(args[1], policy, installed.request, true);
                return 0;
            }

            // Only the isolated Windows CI build accepts unattended test input.
            if (policy.qa && args.Length == 2 && args[0] == "prepare-install-qa")
            {
                var request = NewRequest();
                Directory.CreateDirectory(Path.GetDirectoryName(LicensePath));
                File.WriteAllText(LicensePath + ".pending-qa", request, Utf8);
                File.WriteAllText(args[1], Json.Serialize(new Request { device = request }), Utf8);
                return 0;
            }
            if (policy.qa && args.Length == 2 && args[0] == "accept-install-qa")
            {
                string pending = LicensePath + ".pending-qa";
                var request = Utf8.GetString(ReadLimited(pending));
                File.Delete(pending);
                var response = Utf8.GetString(ReadLimited(args[1]));
                if (Regex.IsMatch(response, @"\A[0-9]{12}\z")) AcceptCode(response, policy, request);
                else AcceptFile(args[1], policy, request, true);
                return 0;
            }
            Console.Error.WriteLine("Usage: HAK-License check | enroll | accept-kit <file.haksetup>");
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

    private static string NewRequest()
    {
        string previous = null;
        if (File.Exists(LicensePath))
        {
            try { previous = ReadInstalledAuthorization().request; }
            catch (Exception error) when (error is IOException || error is CryptographicException ||
                error is ArgumentException || error is InvalidOperationException) { }
        }
        var bytes = new byte[4];
        uint limit = uint.MaxValue - uint.MaxValue % RequestRange;
        using (var rng = RandomNumberGenerator.Create())
        {
            while (true)
            {
                rng.GetBytes(bytes);
                uint value = BitConverter.ToUInt32(bytes, 0);
                if (value >= limit) continue;
                string request = (value % RequestRange).ToString("D8", CultureInfo.InvariantCulture);
                if (request != previous) return request;
            }
        }
    }

    private static byte[] ComputeMac(Policy policy, string domain, byte[] payload)
    {
        var prefix = Utf8.GetBytes(Product + "\n" + domain + "\n");
        var message = new byte[prefix.Length + payload.Length];
        Buffer.BlockCopy(prefix, 0, message, 0, prefix.Length);
        Buffer.BlockCopy(payload, 0, message, prefix.Length, payload.Length);
        using (var hmac = new HMACSHA256(Convert.FromBase64String(policy.seed)))
            return hmac.ComputeHash(message);
    }

    private static bool EqualBytes(byte[] left, byte[] right)
    {
        if (left.Length != right.Length) return false;
        int difference = 0;
        for (int i = 0; i < left.Length; i++) difference |= left[i] ^ right[i];
        return difference == 0;
    }

    private static byte[] ReadLimited(string file, int limit = MaxFileBytes)
    {
        using (var stream = File.OpenRead(file))
        {
            if (stream.Length <= 0 || stream.Length > limit)
                throw new InvalidDataException("Invalid HAK license file length.");
            using (var reader = new BinaryReader(stream))
                return reader.ReadBytes((int)stream.Length);
        }
    }

    private static void AcceptFile(string file, Policy policy, string request, bool requireCompany)
    {
        var blob = ReadLimited(file);
        var license = Verify(blob, policy, request);
        if (requireCompany && license.company == null)
            throw new InvalidDataException("File này thiếu cấu hình công ty do HAK cấp.");
        SaveLicense(blob, request);
    }

    private static License Verify(byte[] blob, Policy policy, string request)
    {
        var envelope = Json.Deserialize<Envelope>(Utf8.GetString(blob));
        var payload = Convert.FromBase64String(envelope.body);
        if (!EqualBytes(ComputeMac(policy, "setup-v1", payload), Convert.FromBase64String(envelope.signature)))
            throw new InvalidDataException("File phản hồi không thuộc bộ cài này hoặc đã bị sửa.");
        var license = Json.Deserialize<License>(Utf8.GetString(payload));
        VerifyRequestAndValidity(license, request);
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

    private static void AcceptCode(string text, Policy policy, string request)
    {
        string code = Regex.Replace(text, @"\s+", "");
        VerifyCode(code, policy, request);
        SaveLicense(Utf8.GetBytes(code), request);
    }

    private static void VerifyCode(string code, Policy policy, string request)
    {
        if (!Regex.IsMatch(request, @"\A[0-9]{8}\z") || !Regex.IsMatch(code, @"\A[0-9]{12}\z"))
            throw new InvalidDataException("Mã trả lời phải có 12 chữ số.");
        var bytes = ComputeMac(policy, "code-v1", Utf8.GetBytes(request));
        ulong value = 0;
        for (int i = 0; i < 6; i++) value = value * 256 + bytes[i];
        string expected = (value % ResponseRange).ToString("D12", CultureInfo.InvariantCulture);
        if (!EqualBytes(Utf8.GetBytes(expected), Utf8.GetBytes(code)))
            throw new InvalidDataException("Mã trả lời không khớp với lần cài này.");
    }

    private static void VerifyRequestAndValidity(License license, string request)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (license == null || license.product != Product || license.version != 2 || license.issuedAt > now ||
            license.expiresAt <= now || license.expiresAt <= license.issuedAt)
            throw new InvalidDataException("File phản hồi đã hết hạn, chưa có hiệu lực hoặc thuộc sản phẩm khác.");
        if (!Regex.IsMatch(request, @"\A[0-9]{8}\z") || license.device != request)
            throw new InvalidDataException("Phản hồi này thuộc mã yêu cầu khác. Gửi mã đang hiển thị cho HAK.");
    }

    private static InstalledAuthorization ReadInstalledAuthorization()
    {
        var data = ProtectedData.Unprotect(ReadLimited(LicensePath, MaxFileBytes * 2), StateContext, DataProtectionScope.CurrentUser);
        var stored = Json.Deserialize<InstalledAuthorization>(Utf8.GetString(data));
        if (stored == null || !Regex.IsMatch(stored.request ?? "", @"\A[0-9]{8}\z") || string.IsNullOrEmpty(stored.authorization))
            throw new InvalidDataException("Cần mã phản hồi cho lần cài này.");
        return stored;
    }

    private static void SaveLicense(byte[] blob, string request)
    {
        string directory = Path.GetDirectoryName(LicensePath);
        Directory.CreateDirectory(directory);
        string temp = Path.Combine(directory, Path.GetRandomFileName());
        try
        {
            var installed = new InstalledAuthorization
            {
                request = request, authorization = Convert.ToBase64String(blob)
            };
            File.WriteAllBytes(temp, ProtectedData.Protect(Utf8.GetBytes(Json.Serialize(installed)), StateContext, DataProtectionScope.CurrentUser));
            if (File.Exists(LicensePath)) File.Replace(temp, LicensePath, null);
            else File.Move(temp, LicensePath);
        }
        finally { File.Delete(temp); }
    }

    public sealed class InstalledAuthorization
    {
        public string request { get; set; }
        public string authorization { get; set; }
    }
    public sealed class Policy { public string seed { get; set; } public bool qa { get; set; } }
    public sealed class Request { public string device { get; set; } }
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
