using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

internal static class Program
{
    private static void Main()
    {
        string directory = Path.Combine(Path.GetTempPath(), "hak-account-test-" + Guid.NewGuid().ToString("N"));
        string path = Path.Combine(directory, "account.hakaccount");
        const string password = "Windows-QA-password";
        try
        {
            var accounts = new AccountStore(path);
            Ensure(accounts.Read() == null, "New install must offer mode selection");
            accounts.InitializeDirect();
            Ensure(!new AccountStore(path).Read().Enabled, "Skip persists direct access");
            Reject<ArgumentException>(() => accounts.Enable("HAK", "short"));
            accounts.Enable("HAK", password);
            Ensure(!Encoding.UTF8.GetString(File.ReadAllBytes(path)).Contains(password), "Plaintext password on disk");

            var reopened = new AccountStore(path);
            Ensure(reopened.Read().Enabled, "Account must survive reopening");
            reopened.Verify("hak", password);
            Reject<InvalidOperationException>(() => reopened.InitializeDirect());
            Reject<UnauthorizedAccessException>(() => reopened.Verify("HAK", "wrong password"));
            Reject<UnauthorizedAccessException>(() => reopened.Disable("other", password));
            Ensure(new AccountStore(path).Read().Enabled, "Invalid disable must leave login enabled");
            reopened.Disable("HAK", password);
            Ensure(!new AccountStore(path).Read().Enabled, "Valid disable must restore direct access");

            File.WriteAllBytes(path, new byte[] { 1, 2, 3 });
            Reject<CryptographicException>(() => reopened.Read());
            Console.WriteLine("PASS: setup mode, credentials, protected storage, authenticated disable and corrupted state.");
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    private static void Ensure(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private static void Reject<T>(Action operation) where T : Exception
    {
        try { operation(); }
        catch (T) { return; }
        throw new InvalidOperationException("Expected " + typeof(T).Name);
    }
}
