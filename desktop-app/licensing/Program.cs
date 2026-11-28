using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

internal static class Program
{
    private const string Product = LicenseProtocol.Product;
    private static readonly byte[] StateContext = Encoding.UTF8.GetBytes(Product);
    private const int MaxFileBytes = 32768;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxFileBytes * 2 };
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    private static readonly string LicensePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HAK", "BaoCaoNgay", "license.haklic");
    private static readonly AccountStore Accounts = new AccountStore(
        Path.Combine(Path.GetDirectoryName(LicensePath), "account.hakaccount"));

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var policy = ReadPolicy();
            if (args.Length == 1 && args[0] == "enroll")
                return Enroll(policy, LicensePath, false);
            if (args.Length == 1 && args[0] == "enroll-install")
                return EnrollInstall(policy);
            if (args.Length == 1 && args[0] == "login")
            {
                var mode = Accounts.Read();
                if (mode == null) return AccountDialog.ChooseMode(Accounts) ? 0 : 1;
                if (!mode.Enabled) return 0;
                return AccountDialog.Credentials("Đăng nhập Báo cáo ngày", "Đăng nhập", Accounts.Verify) ? 0 : 1;
            }
            if (args.Length == 1 && args[0] == "account-mode")
            {
                WriteAccountMode();
                return 0;
            }
            if (args.Length == 2 && args[0] == "configure-account")
            {
                bool enabled = Accounts.Read()?.Enabled == true;
                bool saved;
                if (args[1] == "enable" && !enabled)
                    saved = AccountDialog.Credentials("Bật đăng nhập", "Tạo tài khoản", Accounts.Enable, true);
                else if (args[1] == "disable" && enabled)
                    saved = AccountDialog.Credentials("Tắt đăng nhập", "Xác nhận tắt", Accounts.Disable);
                else
                    throw new InvalidOperationException("Chế độ tài khoản đã thay đổi. Mở lại Cấu hình.");
                if (!saved) return 1;
                WriteAccountMode();
                return 0;
            }
            if (args.Length == 2 && Regex.IsMatch(args[1], @"\A[0-9a-f]{32}\z"))
            {
                string pending = LicensePath + ".pending-" + args[1];
                if (args[0] == "enroll-change") return Enroll(policy, pending, true);
                if (args[0] == "discard-change")
                {
                    File.Delete(pending);
                    return 0;
                }
                if (args[0] == "commit-change")
                {
                    ReadLicense(policy, pending);
                    ReplaceFile(pending, LicensePath);
                    return 0;
                }
            }

            if (args.Length == 1 && args[0] == "check")
            {
                WriteCompany(ReadLicense(policy, LicensePath));
                return 0;
            }

            if (policy.qa && args.Length == 1 && args[0] == "check-other-machine-qa")
            {
                var installed = ReadInstalledAuthorization();
                try
                {
                    LicenseProtocol.OpenSetup(Convert.FromBase64String(installed.authorization),
                        policy.publicKey, installed.session, "foreign-machine");
                }
                catch (InvalidDataException error) when (error.Message == "Giấy phép thuộc ứng dụng hoặc thiết bị khác.")
                {
                    Console.Error.WriteLine("HAK-DEVICE-MISMATCH");
                    return 31;
                }
                return 0;
            }

            // Only the isolated Windows CI build accepts unattended test input.
            if (policy.qa && args.Length == 2 && args[0] == "prepare-install-qa")
            {
                var session = LicenseProtocol.NewSession();
                Directory.CreateDirectory(Path.GetDirectoryName(LicensePath));
                File.WriteAllBytes(LicensePath + ".pending-qa", Protect(Json.Serialize(session)));
                File.WriteAllText(args[1], Json.Serialize(new { device = session.wire }), Utf8);
                return 0;
            }
            if (policy.qa && args.Length == 3 && args[0] == "accept-install-qa")
            {
                string pending = LicensePath + ".pending-qa";
                var session = Json.Deserialize<LicenseProtocol.Session>(Unprotect(ReadLimited(pending)));
                File.Delete(pending);
                LicenseProtocol.VerifyResponse(Utf8.GetString(ReadLimited(args[2])).Trim(), policy.publicKey, session);
                AcceptFile(args[1], policy, session);
                if (Accounts.Read() == null) Accounts.InitializeDirect();
                return 0;
            }
            Console.Error.WriteLine("Usage: HAK-License check | enroll | enroll-install | login | account-mode");
            return 2;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    private static void WriteAccountMode()
    {
        var mode = Accounts.Read();
        if (mode == null) throw new InvalidOperationException("Chưa chọn chế độ tài khoản.");
        Console.WriteLine(mode.Enabled ? "account" : "direct");
    }

    private static bool EnsureAccountMode()
    {
        return Accounts.Read() != null || AccountDialog.ChooseMode(Accounts);
    }

    private static int EnrollInstall(Policy policy)
    {
        string pending = LicensePath + ".install-" + Guid.NewGuid().ToString("N");
        try
        {
            if (Enroll(policy, pending, false) != 0 || !EnsureAccountMode()) return 1;
            ReplaceFile(pending, LicensePath);
            return 0;
        }
        finally { if (File.Exists(pending)) File.Delete(pending); }
    }

    private static int Enroll(Policy policy, string path, bool reportCompany)
    {
        try
        {
            var session = LicenseProtocol.NewSession();
            return ActivationDialog.Run(session.wire,
                text => LicenseProtocol.VerifyResponse(Regex.Replace(text, @"\s+", ""), policy.publicKey, session),
                file =>
                {
                    var license = AcceptFile(file, policy, session, path);
                    if (reportCompany) WriteCompany(license);
                }) ? 0 : 1;
        }
        catch (Exception error)
        {
            System.Windows.Forms.MessageBox.Show("Không tạo được mã yêu cầu trên máy này. " + error.Message,
                "Kích hoạt HAK", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
            return 1;
        }
    }

    private static License ReadLicense(Policy policy, string path)
    {
        var installed = ReadInstalledAuthorization(path);
        return Verify(Convert.FromBase64String(installed.authorization), policy, installed.session);
    }

    private static void WriteCompany(License license)
    {
        Console.WriteLine(Convert.ToBase64String(Utf8.GetBytes(Json.Serialize(license.company))));
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

    private static License AcceptFile(string file, Policy policy, LicenseProtocol.Session session, string destination = null)
    {
        var blob = ReadLimited(file);
        var license = Verify(blob, policy, session);
        SaveLicense(blob, session, destination ?? LicensePath);
        return license;
    }

    private static License Verify(byte[] blob, Policy policy, LicenseProtocol.Session session)
    {
        var license = LicenseProtocol.OpenSetup(blob, policy.publicKey, session, MachineIdentity.Fingerprint.Value);
        if (license.company == null) throw new InvalidDataException("File phản hồi thiếu thông tin công ty.");
        ValidateCompany(license.company);
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
        ValidateSource(profile.XuatHang, "Xuất hàng", false, true);
    }

    private static void ValidateSource(string address, string label, bool required, bool wholeSheet = false)
    {
        address = (address ?? "").Trim();
        if (!required && address.Length == 0) return;
        Uri url;
        if (address.Length > 2000 || address.IndexOfAny(new[] { '\'', '"', '`', '<', '>', '\\', '\r', '\n' }) >= 0 ||
            !Uri.TryCreate(address, UriKind.Absolute, out url) || url.Scheme != "https" ||
            url.Host != "docs.google.com" || !url.IsDefaultPort || !string.IsNullOrEmpty(url.UserInfo))
            throw new InvalidDataException(label + " cần liên kết Google Sheets HTTPS hợp lệ.");
        if (wholeSheet)
        {
            var sheet = Regex.Match(url.AbsolutePath, @"^/spreadsheets/d/([A-Za-z0-9_-]+)(?:/|$)");
            if (!sheet.Success || sheet.Groups[1].Value == "e")
                throw new InvalidDataException(label + " cần liên kết của cả file Google Sheets.");
            return;
        }
        var query = System.Web.HttpUtility.ParseQueryString(url.Query);
        bool published = Regex.IsMatch(url.AbsolutePath, @"^/spreadsheets/d/e/[^/]+/pub/?$") && query.GetValues("output")?[0] == "csv";
        bool exported = Regex.IsMatch(url.AbsolutePath, @"^/spreadsheets/d/[^/]+/export/?$") && query.GetValues("format")?[0] == "csv";
        if (!published && !exported) throw new InvalidDataException(label + " cần liên kết xuất CSV.");
    }

    private static byte[] Protect(string data)
    {
        return ProtectedData.Protect(Utf8.GetBytes(data), StateContext, DataProtectionScope.CurrentUser);
    }

    private static string Unprotect(byte[] data)
    {
        return Utf8.GetString(ProtectedData.Unprotect(data, StateContext, DataProtectionScope.CurrentUser));
    }

    private static InstalledAuthorization ReadInstalledAuthorization(string path = null)
    {
        var stored = Json.Deserialize<InstalledAuthorization>(Unprotect(ReadLimited(path ?? LicensePath, MaxFileBytes * 2)));
        if (stored?.session == null || string.IsNullOrEmpty(stored.authorization))
            throw new InvalidDataException("Cần mã phản hồi cho lần cài này.");
        return stored;
    }

    private static void SaveLicense(byte[] blob, LicenseProtocol.Session session, string destination)
    {
        string directory = Path.GetDirectoryName(destination);
        Directory.CreateDirectory(directory);
        string temp = Path.Combine(directory, Path.GetRandomFileName());
        try
        {
            var installed = new InstalledAuthorization
            {
                session = session, authorization = Convert.ToBase64String(blob)
            };
            File.WriteAllBytes(temp, Protect(Json.Serialize(installed)));
            ReplaceFile(temp, destination);
        }
        finally { File.Delete(temp); }
    }

    private static void ReplaceFile(string source, string destination)
    {
        if (File.Exists(destination)) File.Replace(source, destination, null);
        else File.Move(source, destination);
    }

    public sealed class InstalledAuthorization
    {
        public LicenseProtocol.Session session { get; set; }
        public string authorization { get; set; }
    }
    public sealed class Policy { public string publicKey { get; set; } public bool qa { get; set; } }
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
        public string XuatHang { get; set; }
    }
    public sealed class License
    {
        public Company company { get; set; }
    }
}
