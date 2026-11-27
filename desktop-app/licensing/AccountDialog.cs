using System;
using System.Drawing;
using System.Windows.Forms;

internal static class AccountDialog
{
    internal static bool ChooseMode(AccountStore accounts)
    {
        Application.EnableVisualStyles();
        using (var dialog = CreateForm("Chọn cách sử dụng Báo cáo ngày", 470, 173))
        {
            var direct = new Button { Text = "Một người sử dụng · Bỏ qua", Location = new Point(20, 55), Size = new Size(430, 36) };
            var account = new Button { Text = "Sử dụng tài khoản đăng nhập", Location = new Point(20, 109), Size = new Size(430, 36) };
            direct.Click += (sender, args) =>
            {
                try
                {
                    accounts.InitializeDirect();
                    dialog.DialogResult = DialogResult.OK;
                }
                catch (Exception error) { MessageBox.Show(dialog, error.Message, dialog.Text); }
            };
            account.Click += (sender, args) =>
            {
                if (Credentials("Tạo tài khoản đăng nhập", "Tạo tài khoản", accounts.Enable, true, dialog))
                    dialog.DialogResult = DialogResult.OK;
            };
            dialog.Controls.AddRange(new Control[] {
                new Label { Text = "Chọn cách mở ứng dụng trên máy này.", AutoSize = true, Location = new Point(20, 21) },
                direct, account
            });
            return dialog.ShowDialog() == DialogResult.OK;
        }
    }

    internal static bool Credentials(string title, string action, Action<string, string> apply,
        bool create = false, IWin32Window owner = null)
    {
        Application.EnableVisualStyles();
        using (var dialog = CreateForm(title, 420, create ? 305 : 235))
        {
            var user = new TextBox { Location = new Point(20, 47), Width = 380, MaxLength = 80, AccessibleName = "Tên tài khoản" };
            var password = new TextBox
            {
                Location = new Point(20, 108), Width = 380, MaxLength = 128,
                UseSystemPasswordChar = true, AccessibleName = "Mật khẩu"
            };
            var repeat = new TextBox
            {
                Location = new Point(20, 169), Width = 380, MaxLength = 128,
                UseSystemPasswordChar = true, AccessibleName = "Nhập lại mật khẩu"
            };
            int footer = create ? 251 : 181;
            var status = new Label { Location = new Point(20, footer - 43), Size = new Size(380, 40), ForeColor = Color.DarkRed };
            var confirm = new Button { Text = action, Location = new Point(126, footer), Size = new Size(162, 34) };
            var cancel = new Button
            {
                Text = "Hủy", Location = new Point(300, footer), Size = new Size(100, 34), DialogResult = DialogResult.Cancel
            };
            confirm.Click += (sender, args) =>
            {
                try
                {
                    if (create && !string.Equals(password.Text, repeat.Text, StringComparison.Ordinal))
                        throw new ArgumentException("Hai mật khẩu chưa khớp.");
                    apply(user.Text, password.Text);
                    dialog.DialogResult = DialogResult.OK;
                }
                catch (Exception error)
                {
                    status.Text = error.Message;
                    password.SelectAll();
                    password.Focus();
                }
            };
            dialog.Controls.AddRange(new Control[] {
                new Label { Text = "Tên tài khoản", AutoSize = true, Location = new Point(20, 22) }, user,
                new Label { Text = create ? "Mật khẩu (ít nhất 8 ký tự)" : "Mật khẩu", AutoSize = true, Location = new Point(20, 83) }, password
            });
            if (create)
            {
                dialog.Controls.Add(new Label { Text = "Nhập lại mật khẩu", AutoSize = true, Location = new Point(20, 144) });
                dialog.Controls.Add(repeat);
            }
            dialog.Controls.AddRange(new Control[] { status, confirm, cancel });
            dialog.AcceptButton = confirm;
            dialog.CancelButton = cancel;
            return dialog.ShowDialog(owner) == DialogResult.OK;
        }
    }

    private static Form CreateForm(string title, int width, int height)
    {
        return new Form
        {
            Text = title, AutoScaleMode = AutoScaleMode.Dpi, ClientSize = new Size(width, height),
            StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false, MinimizeBox = false, Font = SystemFonts.MessageBoxFont
        };
    }
}
