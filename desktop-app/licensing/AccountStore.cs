using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

internal sealed class AccountStore
{
    private const int Iterations = 600000;
    private static readonly byte[] Context = Encoding.UTF8.GetBytes("com.hakgroup.baocaongay.account-v1");
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 4096 };
    private readonly string path;

    internal AccountStore(string path) { this.path = path; }

    internal State Read()
    {
        byte[] data;
        try { data = File.ReadAllBytes(path); }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        if (data.Length == 0 || data.Length > 8192) throw InvalidState();

        var value = json.Deserialize<State>(Encoding.UTF8.GetString(
            ProtectedData.Unprotect(data, Context, DataProtectionScope.CurrentUser)));
        if (value == null || value.Version != 1) throw InvalidState();
        if (value.Enabled && (string.IsNullOrWhiteSpace(value.Username) ||
            Convert.FromBase64String(value.Salt ?? "").Length != 16 ||
            Convert.FromBase64String(value.Hash ?? "").Length != 32)) throw InvalidState();
        return value;
    }

    internal void InitializeDirect()
    {
        if (Read() != null) throw new InvalidOperationException("Chế độ sử dụng đã được chọn.");
        Write(new State { Version = 1 });
    }

    internal void Enable(string username, string password)
    {
        var current = Read();
        if (current != null && current.Enabled)
            throw new InvalidOperationException("Đăng nhập đã được bật.");
        username = (username ?? "").Trim();
        if (username.Length == 0 || username.Length > 80)
            throw new ArgumentException("Nhập tên tài khoản từ 1 đến 80 ký tự.");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8 || password.Length > 128)
            throw new ArgumentException("Nhập mật khẩu từ 8 đến 128 ký tự.");
        var salt = new byte[16];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(salt);
        var hash = Derive(password, salt);
        try
        {
            Write(new State
            {
                Version = 1, Enabled = true, Username = username,
                Salt = Convert.ToBase64String(salt), Hash = Convert.ToBase64String(hash)
            });
        }
        finally { Array.Clear(hash, 0, hash.Length); }
    }

    internal void Verify(string username, string password)
    {
        var state = Read();
        if (state == null || !state.Enabled)
            throw new InvalidOperationException("Chưa bật chế độ đăng nhập.");
        if (password == null || password.Length > 128)
            throw new UnauthorizedAccessException("Sai tài khoản hoặc mật khẩu.");
        var actual = Derive(password, Convert.FromBase64String(state.Salt));
        try
        {
            var expected = Convert.FromBase64String(state.Hash);
            int diff = 0;
            for (int i = 0; i < expected.Length; i++) diff |= expected[i] ^ actual[i];
            if (diff != 0 || !string.Equals(state.Username, (username ?? "").Trim(), StringComparison.OrdinalIgnoreCase))
                throw new UnauthorizedAccessException("Sai tài khoản hoặc mật khẩu.");
        }
        finally { Array.Clear(actual, 0, actual.Length); }
    }

    internal void Disable(string username, string password)
    {
        Verify(username, password);
        Write(new State { Version = 1 });
    }

    private static byte[] Derive(string password, byte[] salt)
    {
        using (var kdf = new Rfc2898DeriveBytes(password, salt, Iterations, HashAlgorithmName.SHA256))
            return kdf.GetBytes(32);
    }

    private static InvalidDataException InvalidState()
    {
        return new InvalidDataException("Không đọc được cấu hình tài khoản. Liên hệ quản trị HAK.");
    }

    private void Write(State state)
    {
        string directory = Path.GetDirectoryName(path);
        Directory.CreateDirectory(directory);
        string temporary = Path.Combine(directory, Path.GetRandomFileName());
        try
        {
            byte[] plain = Encoding.UTF8.GetBytes(json.Serialize(state));
            try { File.WriteAllBytes(temporary, ProtectedData.Protect(plain, Context, DataProtectionScope.CurrentUser)); }
            finally { Array.Clear(plain, 0, plain.Length); }
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
        }
        finally { File.Delete(temporary); }
    }

    public sealed class State
    {
        public int Version { get; set; }
        public bool Enabled { get; set; }
        public string Username { get; set; }
        public string Salt { get; set; }
        public string Hash { get; set; }
    }
}
