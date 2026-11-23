// Hosts Microsoft's RDP ActiveX control as a real child HWND of Electron.
// Credentials stay in this process and never pass through Electron or a file.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Native {
    [DllImport("user32.dll")] internal static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] internal static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] internal static extern IntPtr GetWindowDpiAwarenessContext(IntPtr handle);
    [DllImport("user32.dll")] internal static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(IntPtr handle);
    [DllImport("user32.dll")] internal static extern bool SetWindowPos(IntPtr handle, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr handle, int command);
    [DllImport("user32.dll")] internal static extern bool GetClientRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] internal static extern IntPtr GetTopWindow(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] internal struct Rect { public int Left, Top, Right, Bottom; }
}
internal sealed class RdpControl : AxHost {
    internal RdpControl() : base("8B918B82-7985-4C24-89DF-C33AD2BBFBCD") { }
    internal object Client { get { return GetOcx(); } }
}
internal sealed class DesktopHost : Form {
    private readonly IntPtr parent;
    private readonly RdpControl rdp;
    private readonly Panel login;
    private readonly TextBox user, password;
    private readonly Label title, note;
    private readonly ConcurrentQueue<Dictionary<string,object>> commands;
    private readonly System.Windows.Forms.Timer timer;
    private string server = "";
    private int port = 3389;
    private bool fitting = true, closing;
    private int lastWidth, lastHeight;
    private readonly Guid eventsId = new Guid("336D5562-EFA8-482E-8CB3-C5C0FC7A7DB6");
    private readonly Action connecting, connected;
    private readonly Action<int> disconnected;
    internal DesktopHost(IntPtr parentHandle, ConcurrentQueue<Dictionary<string,object>> queue) {
        parent = parentHandle; commands = queue;
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None; BackColor = Color.FromArgb(16,19,26);
        Font = new Font("Segoe UI", 10); ClientSize = new Size(800,500);
        rdp = new RdpControl(); rdp.Dock = DockStyle.Fill;
        ((System.ComponentModel.ISupportInitialize)rdp).BeginInit(); Controls.Add(rdp);
        ((System.ComponentModel.ISupportInitialize)rdp).EndInit();
        login = new Panel(); login.Dock = DockStyle.Fill; login.BackColor = BackColor;
        var fields = new TableLayoutPanel(); fields.Width = 400; fields.Height = 305; fields.ColumnCount = 1; fields.RowCount = 7;
        fields.Anchor = AnchorStyles.None; fields.BackColor = BackColor;
        title = new Label(); title.Text = "Escritorio remoto"; title.AutoSize = true; title.ForeColor = Color.White;
        var userLabel = new Label(); userLabel.Text = "Usuario (DOMINIO\\usuario o usuario@dominio)"; userLabel.AutoSize = true; userLabel.ForeColor = Color.LightGray;
        user = new TextBox(); user.Width = 385;
        var passwordLabel = new Label(); passwordLabel.Text = "Contraseña · no se guarda"; passwordLabel.AutoSize = true; passwordLabel.ForeColor = Color.LightGray;
        password = new TextBox(); password.Width = 385; password.UseSystemPasswordChar = true;
        var connect = new Button(); connect.Text = "Conectar en esta pestaña"; connect.Width = 230; connect.Height = 36;
        connect.BackColor = Color.FromArgb(162,235,196); connect.ForeColor = Color.FromArgb(20,42,32); connect.FlatStyle = FlatStyle.Flat;
        connect.Click += delegate { Connect(); };
        password.KeyDown += delegate(object sender, KeyEventArgs e) { if(e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; Connect(); } };
        note = new Label(); note.Text = "El teclado y el ratón controlarán este escritorio."; note.ForeColor = Color.LightGray; note.Width = 390; note.Height = 70;
        fields.Controls.Add(title); fields.Controls.Add(userLabel); fields.Controls.Add(user); fields.Controls.Add(passwordLabel); fields.Controls.Add(password); fields.Controls.Add(connect); fields.Controls.Add(note);
        login.Controls.Add(fields); login.Resize += delegate { fields.Left = Math.Max(8,(login.ClientSize.Width-fields.Width)/2); fields.Top = Math.Max(8,(login.ClientSize.Height-fields.Height)/2); };
        Controls.Add(login); login.BringToFront();
        // Create the native child before showing anything; no top-level RDP window.
        var handle = Handle; rdp.CreateControl();
        if (Native.GetParent(handle) != parent) Native.SetParent(handle,parent);
        connecting = delegate { Program.Send("connecting", null); };
        connected = delegate { note.Text = ""; Program.Send("connected",null); rdp.Focus(); ResizeDesktop(); };
        disconnected = delegate(int reason) {
            if(closing) return;
            login.Visible = true; login.BringToFront(); password.Clear();
            note.Text = reason == 1 || reason == 2 ? "Sesión desconectada. Puedes volver a conectar." : "No se pudo mantener la conexión (código " + reason + "). Comprueba servidor, credenciales y acceso RDP.";
            Program.Send("disconnected",new Dictionary<string,object>{{"reason",reason}});
        };
        ComEventsHelper.Combine(rdp.Client,eventsId,1,connecting);
        ComEventsHelper.Combine(rdp.Client,eventsId,2,connected);
        ComEventsHelper.Combine(rdp.Client,eventsId,4,disconnected);
        timer = new System.Windows.Forms.Timer(); timer.Interval = 35;
        timer.Tick += delegate { Drain(); }; timer.Start();
        FormClosing += delegate { closing = true; try { if((int)((dynamic)rdp.Client).Connected != 0) ((dynamic)rdp.Client).Disconnect(); } catch {} };
    }
    protected override CreateParams CreateParams {
        get {
            CreateParams cp = base.CreateParams; cp.Parent = parent;
            cp.Style = (cp.Style & unchecked((int)~0x80000000)) | 0x40000000 | 0x02000000 | 0x04000000;
            cp.ExStyle &= ~0x00040000; return cp;
        }
    }
    private void Connect() {
        if(String.IsNullOrEmpty(server)) return;
        try {
            dynamic client = rdp.Client;
            if((int)client.Connected != 0) return;
            client.Server = server;
            string loginName = user.Text.Trim(); int slash = loginName.IndexOf('\\');
            client.Domain = slash > 0 ? loginName.Substring(0,slash) : "";
            client.UserName = slash > 0 ? loginName.Substring(slash+1) : loginName;
            client.AdvancedSettings2.RDPPort = port;
            client.AdvancedSettings2.SmartSizing = fitting;
            client.AdvancedSettings7.EnableCredSspSupport = true;
            client.AdvancedSettings7.AuthenticationLevel = 2;
            client.AdvancedSettings2.RedirectDrives = false;
            client.AdvancedSettings2.RedirectPrinters = false;
            // Avoid the legacy 100 ms batching interval for pointer input.
            client.AdvancedSettings2.minInputSendInterval = 16;
            client.DesktopWidth = Math.Max(200,rdp.ClientSize.Width);
            client.DesktopHeight = Math.Max(200,rdp.ClientSize.Height);
            client.AdvancedSettings2.ClearTextPassword = password.Text;
            password.Clear(); note.Text = "Conectando…";
            login.Visible = false; rdp.Visible = true; rdp.BringToFront();
            client.Connect(); rdp.Focus();
        } catch(Exception error) {
            password.Clear(); login.Visible = true; login.BringToFront();
            note.Text = "No se pudo conectar: " + error.Message;
            Program.Send("error",new Dictionary<string,object>{{"message","No se pudo iniciar la conexión RDP."}});
        }
    }
    private void ResizeDesktop() {
        if(!fitting || rdp.ClientSize.Width<200 || rdp.ClientSize.Height<200) return;
        if(lastWidth==rdp.ClientSize.Width && lastHeight==rdp.ClientSize.Height) return;
        lastWidth=rdp.ClientSize.Width;lastHeight=rdp.ClientSize.Height;
        try {
            dynamic client=rdp.Client;
            if((int)client.Connected==1) client.UpdateSessionDisplaySettings((uint)lastWidth,(uint)lastHeight,(uint)lastWidth,(uint)lastHeight,(uint)0,(uint)100,(uint)100);
        } catch { /* SmartSizing still fits servers without dynamic resolution support. */ }
    }
    private void Drain() {
        if(!Native.IsWindow(parent)) { CloseHost(); return; }
        Dictionary<string,object> command;
        while(commands.TryDequeue(out command)) {
            try {
                string type = Convert.ToString(command["type"]);
                if(type=="close") { CloseHost(); return; }
                if(type=="init") {
                    server=Convert.ToString(command["host"]);port=Convert.ToInt32(command["port"]);
                    user.Text=Convert.ToString(command["username"]);fitting=Convert.ToBoolean(command["fitToTab"]);
                    title.Text = "Conectar a " + server + ":" + port;
                    dynamic client=rdp.Client;
                    client.Server=server;client.AdvancedSettings2.RDPPort=port;
                    client.AdvancedSettings2.SmartSizing=fitting;
                    client.AdvancedSettings7.EnableCredSspSupport=true;
                    client.AdvancedSettings7.AuthenticationLevel=2;
                    client.AdvancedSettings2.RedirectDrives=false;
                    client.AdvancedSettings2.RedirectPrinters=false;
                    client.AdvancedSettings2.minInputSendInterval=16;
                    Program.Send("configured",null);
                } else if(type=="layout") {
                    bool visible=Convert.ToBoolean(command["visible"]);
                    if(!visible) { Native.ShowWindow(Handle,0); continue; }
                    double scale=Native.GetDpiForWindow(parent)/96.0;
                    int x=Math.Max(0,(int)Math.Round(Convert.ToDouble(command["x"])*scale));
                    int y=Math.Max(0,(int)Math.Round(Convert.ToDouble(command["y"])*scale));
                    Native.Rect area;Native.GetClientRect(parent,out area);
                    int width=Math.Min(area.Right-x,Math.Max(1,(int)Math.Round(Convert.ToDouble(command["width"])*scale)));
                    int height=Math.Min(area.Bottom-y,Math.Max(1,(int)Math.Round(Convert.ToDouble(command["height"])*scale)));
                    if(width<=0 || height<=0) { Native.ShowWindow(Handle,0);continue; }
                    if(!Visible) Show();
                    Native.SetWindowPos(Handle,IntPtr.Zero,x,y,width,height,0x0010|0x0040);
                    ResizeDesktop();
                    if(command.ContainsKey("focus") && Convert.ToBoolean(command["focus"])) { if(login.Visible) { if(user.Text.Length==0) user.Focus();else password.Focus(); }else rdp.Focus(); }
                } else if(type=="disconnect") {
                    if((int)((dynamic)rdp.Client).Connected!=0)((dynamic)rdp.Client).Disconnect();
                    login.Visible=true;login.BringToFront();password.Clear();
                } else if(type=="probe") {
                    Native.Rect rect;Native.GetWindowRect(Handle,out rect);
                    Program.Send("probe",new Dictionary<string,object>{{"handle",Handle.ToInt64().ToString()},{"parent",Native.GetParent(Handle).ToInt64().ToString()},{"topChild",Native.GetTopWindow(parent).ToInt64().ToString()},{"left",rect.Left},{"top",rect.Top},{"visible",Native.IsWindowVisible(Handle)},{"width",Width},{"height",Height},{"loginVisible",login.Visible},{"mouseInputIntervalMs",(int)((dynamic)rdp.Client).AdvancedSettings2.minInputSendInterval},{"connected",(int)((dynamic)rdp.Client).Connected}});
                }
            }catch { Program.Send("error",new Dictionary<string,object>{{"message","No se pudo actualizar el panel de escritorio remoto."}}); }
        }
    }
    private void CloseHost() { closing=true;timer.Stop();Close();Application.ExitThread(); }
}
internal static class Program {
    private static readonly object outputLock=new object();
    internal static void Send(string type, Dictionary<string,object> data) {
        lock(outputLock) {
            var message=data ?? new Dictionary<string,object>();message["type"]=type;
            Console.WriteLine(new JavaScriptSerializer().Serialize(message));Console.Out.Flush();
        }
    }
    [STAThread] private static int Main(string[] args) {
        try {
            Console.InputEncoding=new System.Text.UTF8Encoding(false);Console.OutputEncoding=new System.Text.UTF8Encoding(false);
            IntPtr parent=new IntPtr(Int64.Parse(args[0]));
            if(!Native.IsWindow(parent))throw new Exception("La ventana de MyTerminal no existe.");
            Native.SetThreadDpiAwarenessContext(Native.GetWindowDpiAwarenessContext(parent));
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
            var queue=new ConcurrentQueue<Dictionary<string,object>>();
            var reader=new Thread(delegate() {
                string line;
                try { while((line=Console.ReadLine())!=null) { if(line.Length>65536)break;queue.Enqueue(new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line)); } }catch {}
                queue.Enqueue(new Dictionary<string,object>{{"type","close"}});
            });reader.IsBackground=true;reader.Start();
            using(var host=new DesktopHost(parent,queue)) {
                Send("ready",new Dictionary<string,object>{{"parent",Native.GetParent(host.Handle).ToInt64().ToString()},{"handle",host.Handle.ToInt64().ToString()}});
                Application.Run();
            }
            return 0;
        }catch(Exception error) { Send("error",new Dictionary<string,object>{{"message","No se puede iniciar el control RDP de Windows: "+error.Message}});return 1; }
    }
}
