using System;
using System.Drawing;
using System.Windows.Forms;

internal static class ActivationDialog
{
    internal static bool Run(string requestCode, Action<string> activate, Action<string> import)
    {
        Application.EnableVisualStyles();
        using (var dialog = new Form
        {
            Text = "Kích hoạt và cấu hình Báo cáo ngày HAK", AutoScaleMode = AutoScaleMode.Dpi,
            ClientSize = new Size(550, 350), StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false,
            Font = SystemFonts.MessageBoxFont
        })
        {
            var request = new TextBox
            {
                Text = requestCode, ReadOnly = true, Location = new Point(20, 48), Width = 380,
                AccessibleName = "Mã yêu cầu"
            };
            var copy = new Button { Text = "Sao chép", Location = new Point(410, 46), Size = new Size(120, 28) };
            var response = new TextBox
            {
                Location = new Point(20, 137), Size = new Size(510, 102), Multiline = true,
                MaxLength = 4096, ScrollBars = ScrollBars.Vertical, AccessibleName = "Mã trả lời"
            };
            var importFile = new Button { Text = "Nạp file HAK…", Location = new Point(20, 308), Size = new Size(145, 29) };
            var status = new Label { Location = new Point(20, 249), Size = new Size(510, 47), ForeColor = Color.DarkRed };
            var confirm = new Button { Text = "Kích hoạt", Location = new Point(318, 308), Size = new Size(105, 29) };
            var cancel = new Button { Text = "Đóng", Location = new Point(433, 308), Size = new Size(97, 29), DialogResult = DialogResult.Cancel };
            copy.Click += (sender, args) =>
            {
                try
                {
                    Clipboard.SetText(requestCode);
                    status.ForeColor = Color.DarkGreen;
                    status.Text = "Đã sao chép. Gửi mã yêu cầu cho người duyệt của HAK.";
                }
                catch (System.Runtime.InteropServices.ExternalException)
                {
                    request.SelectAll();
                    request.Focus();
                    status.ForeColor = Color.DarkRed;
                    status.Text = "Bộ nhớ tạm đang bận. Bấm Ctrl+C để sao chép mã.";
                }
            };
            importFile.Click += (sender, args) =>
            {
                using (var picker = new OpenFileDialog { Filter = "Cài đặt công ty HAK (*.haksetup)|*.haksetup" })
                {
                    if (picker.ShowDialog(dialog) != DialogResult.OK) return;
                    try
                    {
                        import(picker.FileName);
                        dialog.DialogResult = DialogResult.OK;
                    }
                    catch (Exception error)
                    {
                        status.ForeColor = Color.DarkRed;
                        status.Text = error.Message;
                    }
                }
            };
            confirm.Click += (sender, args) =>
            {
                try
                {
                    activate(response.Text);
                    dialog.DialogResult = DialogResult.OK;
                    dialog.Close();
                }
                catch (Exception error)
                {
                    status.ForeColor = Color.DarkRed;
                    status.Text = error.Message;
                }
            };
            dialog.Controls.AddRange(new Control[] {
                new Label { Text = "1. Gửi mã này cho HAK và giữ cửa sổ mở khi chờ phản hồi", AutoSize = true, Location = new Point(20, 20) },
                request, copy,
                new Label { Text = "2. Nạp file HAK gửi lại hoặc dán mã trả lời (Ctrl+V)", AutoSize = true, Location = new Point(20, 108) },
                response, status, importFile, confirm, cancel
            });
            dialog.CancelButton = cancel;
            dialog.ActiveControl = response;
            return dialog.ShowDialog() == DialogResult.OK;
        }
    }
}
