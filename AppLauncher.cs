using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Your Filament Manager")]
[assembly: AssemblyDescription("Your Filament Manager - Desktop Application")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Giulio Cantarelli")]
[assembly: AssemblyProduct("Your Filament Manager")]
[assembly: AssemblyCopyright("Copyright © 2026 Giulio Cantarelli")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: ComVisible(false)]
[assembly: Guid("8c9e4b2a-5d1f-4e7b-9a3c-2f6d8e1a4b5c")]
[assembly: AssemblyVersion("1.2.0.0")]
[assembly: AssemblyFileVersion("1.2.0.0")]

namespace YourFilamentManager
{
    internal static class Program
    {
        private const int BasePort = 8080;
        private const int MaxPort = 8095;

        private static readonly object DbLock = new object();
        private static string _baseDir;
        private static string _publicDir;
        private static string _dataDir;
        private static string _dbFile;
        private static string _pairingFile;
        private static volatile bool _running = true;
        private static TcpListener _listener;

        private const int SwShow = 5;
        private const int SwRestore = 9;

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        private static readonly HashSet<string> AllowedReadonlyEndpoints = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "/api/v1/device-management-server/device/list",
            "/api/v1/device-management-server/device/report-data/list",
            "/api/v1/device-management-server/local-file/page",
            "/api/v1/device-management-server/local-file/filename",
            "/api/v1/device-management-server/device/event-data/page",
            "/api/v1/account-center-server/account-info/account"
        };

        [STAThread]
        private static void Main()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            _baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            _publicDir = Path.Combine(_baseDir, "public");
            _dataDir = Path.Combine(_baseDir, "data");
            _dbFile = Path.Combine(_dataDir, "filament_db.json");
            _pairingFile = Path.Combine(_dataDir, "slicer_pairing.json");
            Directory.CreateDirectory(_dataDir);

            string profileDir = Path.Combine(_dataDir, "desktop_app_profile");
            Directory.CreateDirectory(profileDir);

            if (!Directory.Exists(_publicDir))
            {
                MessageBox.Show(
                    "Cartella 'public' non trovata in:\n" + _baseDir,
                    "Your Filament Manager",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            bool createdNewMutex = false;
            using (Mutex mutex = new Mutex(true, "Local\\YourFilamentManagerNativeAppMutex", out createdNewMutex))
            {
                if (!createdNewMutex)
                {
                    int existingPort = FindActiveLoopbackPort();
                    string existingUrl = "http://127.0.0.1:" + existingPort;
                    string exe = FindAppBrowserExecutable();
                    if (!string.IsNullOrEmpty(exe))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = exe,
                            Arguments = "--app=" + existingUrl + " --window-size=1320,880 --user-data-dir=\"" + profileDir + "\" --no-first-run --no-default-browser-check --disable-background-mode",
                            WorkingDirectory = _baseDir,
                            UseShellExecute = false
                        });
                    }
                    else
                    {
                        Process.Start(new ProcessStartInfo(existingUrl) { UseShellExecute = true });
                    }
                    return;
                }

                ResetStaleSlicerPairingOnStartup();

                int boundPort = StartLoopbackListener();
                if (boundPort <= 0)
                {
                    MessageBox.Show(
                        "Impossibile avviare il canale locale dell'app (porte 8080-8095 occupate).",
                        "Your Filament Manager",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                Thread acceptThread = new Thread(AcceptLoop);
                acceptThread.IsBackground = true;
                acceptThread.Start();

                string appUrl = "http://127.0.0.1:" + boundPort;

                try
                {
                    string browserExe = FindAppBrowserExecutable();
                    if (!string.IsNullOrEmpty(browserExe))
                    {
                        ProcessStartInfo appPsi = new ProcessStartInfo();
                        appPsi.FileName = browserExe;
                        appPsi.Arguments =
                            "--app=" + appUrl +
                            " --window-size=1320,880" +
                            " --user-data-dir=\"" + profileDir + "\"" +
                            " --no-first-run --no-default-browser-check --disable-background-mode";
                        appPsi.WorkingDirectory = _baseDir;
                        appPsi.UseShellExecute = false;

                        using (Process appProc = Process.Start(appPsi))
                        {
                            if (appProc != null)
                            {
                                appProc.WaitForExit();
                            }
                        }
                    }
                    else
                    {
                        Process.Start(new ProcessStartInfo(appUrl) { UseShellExecute = true });
                        Application.Run();
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Errore durante l'esecuzione dell'applicazione:\n" + ex.Message,
                        "Your Filament Manager",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
                finally
                {
                    _running = false;
                    try { if (_listener != null) _listener.Stop(); } catch { }
                }
            }
        }

        private static string ReadConfiguredCloudUrl()
        {
            try
            {
                string cloudUrlFile = Path.Combine(_dataDir, "cloud_url.txt");
                if (File.Exists(cloudUrlFile))
                {
                    return (File.ReadAllText(cloudUrlFile, Encoding.UTF8) ?? "").Trim();
                }
            }
            catch { }
            return "";
        }

        private static int FindActiveLoopbackPort()
        {
            for (int p = BasePort; p <= MaxPort; p++)
            {
                if (IsPortOpen("127.0.0.1", p, 120)) return p;
            }
            return BasePort;
        }

        private static int StartLoopbackListener()
        {
            for (int port = BasePort; port <= MaxPort; port++)
            {
                try
                {
                    TcpListener listener = new TcpListener(IPAddress.Loopback, port);
                    listener.Start();
                    _listener = listener;
                    return port;
                }
                catch
                {
                }
            }
            return -1;
        }

        private static void AcceptLoop()
        {
            while (_running)
            {
                try
                {
                    if (_listener == null) break;
                    TcpClient client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch
                {
                    if (!_running) break;
                    Thread.Sleep(25);
                }
            }
        }

        private static void HandleClient(object state)
        {
            TcpClient client = state as TcpClient;
            if (client == null) return;

            try
            {
                using (client)
                using (NetworkStream stream = client.GetStream())
                {
                    HttpRequestData req = ReadHttpRequest(stream);
                    if (req == null) return;

                    string method = req.Method;
                    string rawPath = req.RawPath;
                    int qIdx = rawPath.IndexOf('?');
                    string path = qIdx >= 0 ? rawPath.Substring(0, qIdx) : rawPath;

                    if (method == "OPTIONS")
                    {
                        WriteHttpResponse(stream, 204, "No Content", "text/plain; charset=utf-8", new byte[0]);
                        return;
                    }

                    if (path == "/api/info" && method == "GET")
                    {
                        var info = new Dictionary<string, object>
                        {
                            { "ok", true },
                            { "mode", "desktop-native" },
                            { "port", ((IPEndPoint)_listener.LocalEndpoint).Port }
                        };
                        string cloudUrl = ReadConfiguredCloudUrl();
                        if (!string.IsNullOrEmpty(cloudUrl))
                        {
                            info["cloudAppUrl"] = cloudUrl;
                        }
                        WriteJsonResponse(stream, 200, NewSerializer().Serialize(info));
                        return;
                    }

                    if (path == "/api/data" && method == "GET")
                    {
                        SyncPairedSlicerTokenIfNeeded();
                        string json = ReadDbFileRaw();
                        if (string.IsNullOrWhiteSpace(json))
                        {
                            WriteJsonResponse(stream, 200, "{\"empty\":true}");
                        }
                        else
                        {
                            WriteJsonResponse(stream, 200, json);
                        }
                        return;
                    }

                    if (path == "/api/data" && method == "POST")
                    {
                        lock (DbLock)
                        {
                            File.WriteAllText(_dbFile, req.Body ?? "{}", new UTF8Encoding(false));
                        }
                        WriteJsonResponse(stream, 200, "{\"ok\":true}");
                        return;
                    }

                    if (path == "/api/slicer/status" && method == "GET")
                    {
                        WriteJsonResponse(stream, 200, HandleSlicerStatus());
                        return;
                    }

                    if (path == "/api/slicer/force-relogin" && method == "POST")
                    {
                        WriteJsonResponse(stream, 200, HandleSlicerForceRelogin());
                        return;
                    }

                    if (path == "/api/slicer/adopt-current" && method == "POST")
                    {
                        WriteJsonResponse(stream, 200, HandleSlicerAdoptCurrent());
                        return;
                    }

                    if (path == "/api/cloud/login" && method == "POST")
                    {
                        WriteJsonResponse(stream, 200, HandleCloudLogin(req.Body));
                        return;
                    }

                    if (path == "/api/cloud/proxy" && method == "POST")
                    {
                        HandleCloudProxy(stream, req.Body);
                        return;
                    }

                    ServeStaticFile(stream, path);
                }
            }
            catch
            {
            }
        }

        // ====================================================================
        // ELEGOO SLICER DPAPI BRIDGE (100% LOCAL)
        // ====================================================================
        private static string GetElegooSlicerUserInfoPath()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ElegooSlicer", "user", "user_info");
        }

        private static string GetElegooSlicerExePath()
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates = new string[]
            {
                Path.Combine(pf, "ElegooSlicer", "elegoo-slicer.exe"),
                Path.Combine(localApp, "Programs", "ElegooSlicer", "elegoo-slicer.exe"),
                Path.Combine(pf86, "ElegooSlicer", "elegoo-slicer.exe")
            };
            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
            }
            return null;
        }

        private static bool IsElegooSlicerRunning()
        {
            Process[] procs = Process.GetProcessesByName("elegoo-slicer");
            bool running = procs != null && procs.Length > 0;
            if (procs != null)
            {
                foreach (Process p in procs) p.Dispose();
            }
            return running;
        }

        private static Dictionary<string, object> ReadElegooSlicerUserInfo()
        {
            string path = GetElegooSlicerUserInfoPath();
            if (!File.Exists(path)) return null;

            try
            {
                byte[] encrypted = File.ReadAllBytes(path);
                byte[] decrypted = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
                string json = Encoding.UTF8.GetString(decrypted);
                var obj = NewSerializer().DeserializeObject(json) as Dictionary<string, object>;
                if (obj == null) return null;

                string rawRegion = GetStr(obj, "region").Trim().ToUpperInvariant();
                string normRegion = rawRegion == "CN" ? "cn" : "intl";

                return new Dictionary<string, object>
                {
                    { "token", GetStr(obj, "token").Trim() },
                    { "refreshToken", GetStr(obj, "refreshToken").Trim() },
                    { "loginStatus", GetInt(obj, "loginStatus") },
                    { "loginTime", GetInt64(obj, "loginTime") },
                    { "email", GetStr(obj, "email").Trim() },
                    { "nickname", GetStr(obj, "nickname").Trim() },
                    { "userId", GetStr(obj, "userId").Trim() },
                    { "region", normRegion }
                };
            }
            catch
            {
                return null;
            }
        }

        private static Dictionary<string, object> TestElegooTokenLive(string region, string token)
        {
            if (string.IsNullOrWhiteSpace(token)) return null;
            try
            {
                string baseUrl = GetMatrixBaseUrl(region);
                HttpResult res = InvokeElegooHttp(baseUrl + "/api/v1/account-center-server/account-info/account", "GET", null, token);
                if (res.StatusCode == 200 && !string.IsNullOrWhiteSpace(res.Body))
                {
                    var parsed = NewSerializer().DeserializeObject(res.Body) as Dictionary<string, object>;
                    if (parsed != null)
                    {
                        int code = GetInt(parsed, "code");
                        if ((code == 0 || code == 200) && parsed.ContainsKey("data"))
                        {
                            var dataDict = parsed["data"] as Dictionary<string, object>;
                            if (dataDict != null && !string.IsNullOrEmpty(GetStr(dataDict, "id")))
                            {
                                return dataDict;
                            }
                        }
                    }
                }
            }
            catch
            {
            }
            return null;
        }

        private static Dictionary<string, object> LoadPairingState()
        {
            lock (DbLock)
            {
                if (File.Exists(_pairingFile))
                {
                    try
                    {
                        string raw = File.ReadAllText(_pairingFile, Encoding.UTF8).TrimStart('\uFEFF');
                        var parsed = NewSerializer().DeserializeObject(raw) as Dictionary<string, object>;
                        if (parsed != null) return parsed;
                    }
                    catch
                    {
                    }
                }
                return new Dictionary<string, object>
                {
                    { "firstRunCompleted", false },
                    { "waitingForFreshLogin", false },
                    { "baselineToken", "" },
                    { "baselineLoginTime", 0L },
                    { "pairedToken", "" },
                    { "pairedLoginTime", 0L }
                };
            }
        }

        private static void SavePairingState(Dictionary<string, object> pairing)
        {
            lock (DbLock)
            {
                string json = NewSerializer().Serialize(pairing);
                File.WriteAllText(_pairingFile, json, new UTF8Encoding(false));
            }
        }

        private static string ReadDbFileRaw()
        {
            lock (DbLock)
            {
                if (!File.Exists(_dbFile)) return null;
                return File.ReadAllText(_dbFile, Encoding.UTF8).TrimStart('\uFEFF');
            }
        }

        private static void SyncTokenIntoLocalDb(string region, string token, string refreshToken, Dictionary<string, object> userObj)
        {
            if (string.IsNullOrWhiteSpace(token)) return;
            lock (DbLock)
            {
                string rawDb = File.Exists(_dbFile) ? File.ReadAllText(_dbFile, Encoding.UTF8).TrimStart('\uFEFF') : "";
                string emailStr = userObj != null ? GetStr(userObj, "email") : "";
                var authObj = new Dictionary<string, object>
                {
                    { "loggedIn", true },
                    { "region", string.IsNullOrEmpty(region) ? "intl" : region },
                    { "email", emailStr },
                    { "token", token },
                    { "refreshToken", refreshToken ?? "" },
                    { "user", userObj }
                };
                string authJson = NewSerializer().Serialize(authObj);
                long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                string updated = ElegooCrypto.UpsertDbAuth(rawDb, authJson, nowMs);
                File.WriteAllText(_dbFile, updated, new UTF8Encoding(false));
            }
        }

        private static void SyncPairedSlicerTokenIfNeeded()
        {
            try
            {
                var pairing = LoadPairingState();
                if (!GetBool(pairing, "firstRunCompleted")) return;

                var slicerInfo = ReadElegooSlicerUserInfo();
                if (slicerInfo == null || GetInt(slicerInfo, "loginStatus") != 1) return;

                string tok = GetStr(slicerInfo, "token");
                if (string.IsNullOrWhiteSpace(tok) || tok == GetStr(pairing, "pairedToken")) return;

                string reg = GetStr(slicerInfo, "region");
                var liveUser = TestElegooTokenLive(reg, tok);
                if (liveUser != null)
                {
                    pairing["pairedToken"] = tok;
                    pairing["pairedLoginTime"] = GetInt64(slicerInfo, "loginTime");
                    SavePairingState(pairing);
                    SyncTokenIntoLocalDb(reg, tok, GetStr(slicerInfo, "refreshToken"), liveUser);
                }
            }
            catch
            {
            }
        }

        private static string HandleSlicerStatus()
        {
            var ser = NewSerializer();
            try
            {
                var slicerInfo = ReadElegooSlicerUserInfo();
                var pairing = LoadPairingState();
                bool slicerRunning = IsElegooSlicerRunning();
                string appDataSlicerDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ElegooSlicer");
                bool slicerInstalled = !string.IsNullOrEmpty(GetElegooSlicerExePath()) || Directory.Exists(appDataSlicerDir);

                bool firstRunCompleted = GetBool(pairing, "firstRunCompleted");
                bool waitingForFresh = GetBool(pairing, "waitingForFreshLogin");

                if (!firstRunCompleted || waitingForFresh)
                {
                    if (
                        waitingForFresh &&
                        slicerInfo != null &&
                        GetInt(slicerInfo, "loginStatus") == 1 &&
                        !string.IsNullOrWhiteSpace(GetStr(slicerInfo, "token")) &&
                        (GetInt64(slicerInfo, "loginTime") > GetInt64(pairing, "baselineLoginTime") || GetStr(slicerInfo, "token") != GetStr(pairing, "baselineToken"))
                    )
                    {
                        string reg = GetStr(slicerInfo, "region");
                        string tok = GetStr(slicerInfo, "token");
                        string refTok = GetStr(slicerInfo, "refreshToken");
                        var liveUser = TestElegooTokenLive(reg, tok);
                        if (liveUser != null)
                        {
                            pairing["firstRunCompleted"] = true;
                            pairing["waitingForFreshLogin"] = false;
                            pairing["pairedToken"] = tok;
                            pairing["pairedLoginTime"] = GetInt64(slicerInfo, "loginTime");
                            SavePairingState(pairing);
                            SyncTokenIntoLocalDb(reg, tok, refTok, liveUser);

                            return ser.Serialize(new Dictionary<string, object>
                            {
                                { "ok", true },
                                { "available", slicerInstalled },
                                { "paired", true },
                                { "needsForcedRelogin", false },
                                { "waitingForFreshLogin", false },
                                { "slicerRunning", slicerRunning },
                                { "token", tok },
                                { "refreshToken", refTok },
                                { "region", reg },
                                { "user", liveUser }
                            });
                        }
                    }

                    bool hasCurrentValidToken = false;
                    if (slicerInfo != null && GetInt(slicerInfo, "loginStatus") == 1 && !string.IsNullOrWhiteSpace(GetStr(slicerInfo, "token")))
                    {
                        hasCurrentValidToken = TestElegooTokenLive(GetStr(slicerInfo, "region"), GetStr(slicerInfo, "token")) != null;
                    }

                    return ser.Serialize(new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "available", slicerInstalled },
                        { "paired", false },
                        { "needsForcedRelogin", true },
                        { "waitingForFreshLogin", waitingForFresh },
                        { "hasCurrentValidToken", hasCurrentValidToken },
                        { "slicerRunning", slicerRunning }
                    });
                }

                if (slicerInfo != null && GetInt(slicerInfo, "loginStatus") == 1 && !string.IsNullOrWhiteSpace(GetStr(slicerInfo, "token")))
                {
                    string reg = GetStr(slicerInfo, "region");
                    string tok = GetStr(slicerInfo, "token");
                    string refTok = GetStr(slicerInfo, "refreshToken");
                    var liveUser = TestElegooTokenLive(reg, tok);
                    if (liveUser != null)
                    {
                        pairing["pairedToken"] = tok;
                        pairing["pairedLoginTime"] = GetInt64(slicerInfo, "loginTime");
                        SavePairingState(pairing);
                        SyncTokenIntoLocalDb(reg, tok, refTok, liveUser);

                        return ser.Serialize(new Dictionary<string, object>
                        {
                            { "ok", true },
                            { "available", slicerInstalled },
                            { "paired", true },
                            { "needsForcedRelogin", false },
                            { "waitingForFreshLogin", false },
                            { "slicerRunning", slicerRunning },
                            { "token", tok },
                            { "refreshToken", refTok },
                            { "region", reg },
                            { "user", liveUser }
                        });
                    }
                }

                return ser.Serialize(new Dictionary<string, object>
                {
                    { "ok", true },
                    { "available", slicerInstalled },
                    { "paired", false },
                    { "needsForcedRelogin", true },
                    { "waitingForFreshLogin", false },
                    { "slicerRunning", slicerRunning },
                    { "reason", "expired" }
                });
            }
            catch (Exception ex)
            {
                return ser.Serialize(new Dictionary<string, object>
                {
                    { "ok", false },
                    { "available", false },
                    { "error", ex.Message }
                });
            }
        }

        private static bool FocusElegooSlicerWindow()
        {
            bool focused = false;
            Process[] procs = Process.GetProcessesByName("elegoo-slicer");
            if (procs != null)
            {
                foreach (Process p in procs)
                {
                    try
                    {
                        IntPtr hWnd = p.MainWindowHandle;
                        if (hWnd != IntPtr.Zero)
                        {
                            ShowWindow(hWnd, IsIconic(hWnd) ? SwRestore : SwShow);
                            SetForegroundWindow(hWnd);
                            focused = true;
                        }
                    }
                    catch
                    {
                    }
                    finally
                    {
                        p.Dispose();
                    }
                }
            }
            return focused;
        }

        private static void ResetStaleSlicerPairingOnStartup()
        {
            try
            {
                if (IsElegooSlicerRunning()) return;

                string uiPath = GetElegooSlicerUserInfoPath();
                string bakPath = uiPath + ".bak";
                if (!File.Exists(uiPath) && File.Exists(bakPath))
                {
                    File.Move(bakPath, uiPath);
                }

                var pairing = LoadPairingState();
                if (GetBool(pairing, "waitingForFreshLogin"))
                {
                    pairing["waitingForFreshLogin"] = false;
                    SavePairingState(pairing);
                }
            }
            catch
            {
            }
        }

        private static string HandleSlicerForceRelogin()
        {
            var ser = NewSerializer();
            try
            {
                var slicerInfo = ReadElegooSlicerUserInfo();
                bool slicerRunning = IsElegooSlicerRunning();
                string baselineTok = slicerInfo != null ? GetStr(slicerInfo, "token") : "";
                long baselineTs = slicerInfo != null ? GetInt64(slicerInfo, "loginTime") : 0L;
                string exePath = GetElegooSlicerExePath();

                var newPairing = new Dictionary<string, object>
                {
                    { "firstRunCompleted", false },
                    { "waitingForFreshLogin", true },
                    { "baselineToken", baselineTok },
                    { "baselineLoginTime", baselineTs },
                    { "pairedToken", "" },
                    { "pairedLoginTime", 0L }
                };

                bool slicerLaunched = false;
                if (slicerRunning)
                {
                    bool focused = FocusElegooSlicerWindow();
                    if (!focused && !string.IsNullOrEmpty(exePath))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = exePath,
                            WorkingDirectory = Path.GetDirectoryName(exePath),
                            UseShellExecute = true,
                            WindowStyle = ProcessWindowStyle.Normal
                        });
                        slicerLaunched = true;
                    }
                }
                else
                {
                    if (string.IsNullOrEmpty(exePath))
                    {
                        return ser.Serialize(new Dictionary<string, object>
                        {
                            { "ok", false },
                            { "error", "Elegoo Slicer non trovato sul PC (atteso in Programmi\\ElegooSlicer\\elegoo-slicer.exe)." }
                        });
                    }

                    string uiPath = GetElegooSlicerUserInfoPath();
                    if (File.Exists(uiPath))
                    {
                        File.Copy(uiPath, uiPath + ".bak", true);
                        File.Delete(uiPath);
                    }

                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exePath,
                        WorkingDirectory = Path.GetDirectoryName(exePath),
                        UseShellExecute = true,
                        WindowStyle = ProcessWindowStyle.Normal
                    });
                    slicerLaunched = true;
                }

                SavePairingState(newPairing);
                return ser.Serialize(new Dictionary<string, object>
                {
                    { "ok", true },
                    { "waitingForFreshLogin", true },
                    { "slicerRunning", slicerRunning },
                    { "slicerLaunched", slicerLaunched }
                });
            }
            catch (Exception ex)
            {
                return ser.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", ex.Message } });
            }
        }

        private static string HandleSlicerAdoptCurrent()
        {
            var ser = NewSerializer();
            try
            {
                var slicerInfo = ReadElegooSlicerUserInfo();
                if (slicerInfo != null && GetInt(slicerInfo, "loginStatus") == 1 && !string.IsNullOrWhiteSpace(GetStr(slicerInfo, "token")))
                {
                    string reg = GetStr(slicerInfo, "region");
                    string tok = GetStr(slicerInfo, "token");
                    string refTok = GetStr(slicerInfo, "refreshToken");
                    var liveUser = TestElegooTokenLive(reg, tok);
                    if (liveUser != null)
                    {
                        var pairing = new Dictionary<string, object>
                        {
                            { "firstRunCompleted", true },
                            { "waitingForFreshLogin", false },
                            { "baselineToken", "" },
                            { "baselineLoginTime", 0L },
                            { "pairedToken", tok },
                            { "pairedLoginTime", GetInt64(slicerInfo, "loginTime") }
                        };
                        SavePairingState(pairing);
                        SyncTokenIntoLocalDb(reg, tok, refTok, liveUser);

                        return ser.Serialize(new Dictionary<string, object>
                        {
                            { "ok", true },
                            { "paired", true },
                            { "token", tok },
                            { "refreshToken", refTok },
                            { "region", reg },
                            { "user", liveUser }
                        });
                    }
                }
                return ser.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", "Nessuna sessione attiva valida trovata in Elegoo Slicer." } });
            }
            catch (Exception ex)
            {
                return ser.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", ex.Message } });
            }
        }

        // ====================================================================
        // DIRECT ELEGOO CLOUD HTTP CLIENT & AUTH HANDLER
        // ====================================================================
        private static string GetMatrixBaseUrl(string region)
        {
            return string.Equals(region, "cn", StringComparison.OrdinalIgnoreCase)
                ? "https://matrix.elegoo.com.cn"
                : "https://matrix.elegoo.com";
        }

        private sealed class HttpResult
        {
            public int StatusCode;
            public string Body;
        }

        private static HttpResult InvokeElegooHttp(string url, string method, string bodyJson, string token)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = method;
            req.ContentType = "application/json; charset=utf-8";
            req.Accept = "application/json, text/plain, */*";
            req.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ElegooSlicer/1.2.0";
            req.Timeout = 20000;
            req.Headers.Add("Accept-Language", "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7");

            if (!string.IsNullOrWhiteSpace(token))
            {
                string clean = token.Trim();
                if (clean.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    clean = clean.Substring(7).Trim();
                }
                req.Headers.Add("Authorization", "Bearer " + clean);
                req.Headers.Add("token", clean);
                req.Headers.Add("X-Token", clean);
            }

            if (method != "GET" && !string.IsNullOrEmpty(bodyJson))
            {
                byte[] bytes = Encoding.UTF8.GetBytes(bodyJson);
                req.ContentLength = bytes.Length;
                using (Stream reqStream = req.GetRequestStream())
                {
                    reqStream.Write(bytes, 0, bytes.Length);
                }
            }

            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (Stream respStream = resp.GetResponseStream())
                using (StreamReader reader = new StreamReader(respStream, Encoding.UTF8))
                {
                    return new HttpResult { StatusCode = (int)resp.StatusCode, Body = reader.ReadToEnd() };
                }
            }
            catch (WebException wex)
            {
                HttpWebResponse errResp = wex.Response as HttpWebResponse;
                if (errResp != null)
                {
                    using (errResp)
                    using (Stream respStream = errResp.GetResponseStream())
                    using (StreamReader reader = new StreamReader(respStream, Encoding.UTF8))
                    {
                        return new HttpResult { StatusCode = (int)errResp.StatusCode, Body = reader.ReadToEnd() };
                    }
                }
                throw;
            }
        }

        private static string HandleCloudLogin(string reqBody)
        {
            var ser = NewSerializer();
            try
            {
                var payload = ser.DeserializeObject(reqBody ?? "{}") as Dictionary<string, object>;
                string email = GetStr(payload, "email").Trim();
                string password = GetStr(payload, "password").Trim();
                string region = GetStr(payload, "region");
                if (string.IsNullOrEmpty(region)) region = "intl";
                string baseUrl = GetMatrixBaseUrl(region);

                HttpResult keyResp = InvokeElegooHttp(baseUrl + "/api/v1/account-center-server/account-auth/key", "POST", "{\"clientId\":\"Slicer\"}", null);
                var keyData = ser.DeserializeObject(keyResp.Body ?? "{}") as Dictionary<string, object>;
                string pubKey = "";
                if (keyData != null)
                {
                    var kd = keyData.ContainsKey("data") ? keyData["data"] as Dictionary<string, object> : null;
                    if (kd != null) pubKey = GetStr(kd, "publicKey");
                    if (string.IsNullOrEmpty(pubKey)) pubKey = GetStr(keyData, "publicKey");
                }

                if (string.IsNullOrWhiteSpace(pubKey))
                {
                    return ser.Serialize(new Dictionary<string, object>
                    {
                        { "ok", false },
                        { "error", "Impossibile ottenere la chiave pubblica RSA da Elegoo Cloud." }
                    });
                }

                string aesKeyPlain = ElegooCrypto.RandomString("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 32);
                string aesIvPlain = ElegooCrypto.RandomString("0123456789", 16);

                string encPassword = ElegooCrypto.AesEncryptBase64(password, aesKeyPlain, aesIvPlain);
                string encAesKey = ElegooCrypto.RsaEncryptSpkiBase64(aesKeyPlain, pubKey);
                string encAesIv = ElegooCrypto.RsaEncryptSpkiBase64(aesIvPlain, pubKey);

                string loginJson = ser.Serialize(new Dictionary<string, object>
                {
                    { "clientId", "Slicer" },
                    { "email", email },
                    { "password", encPassword },
                    { "aesKey", encAesKey },
                    { "aesIv", encAesIv }
                });

                HttpResult loginResp = InvokeElegooHttp(baseUrl + "/api/v1/account-center-server/account-auth/login/email/password", "POST", loginJson, null);
                var loginObj = ser.DeserializeObject(loginResp.Body ?? "{}") as Dictionary<string, object>;
                var loginData = loginObj != null && loginObj.ContainsKey("data") ? loginObj["data"] as Dictionary<string, object> : null;

                string token = loginData != null ? GetStr(loginData, "token") : "";
                if (string.IsNullOrEmpty(token) && loginData != null) token = GetStr(loginData, "accessToken");
                string refreshToken = loginData != null ? GetStr(loginData, "refreshToken") : "";

                if (string.IsNullOrWhiteSpace(token))
                {
                    string msg = loginObj != null ? GetStr(loginObj, "msg") : "";
                    if (string.IsNullOrEmpty(msg) && loginObj != null) msg = GetStr(loginObj, "message");
                    if (string.IsNullOrEmpty(msg)) msg = "Credenziali non valide o errore Elegoo Cloud.";
                    return ser.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", msg } });
                }

                Dictionary<string, object> userInfo = TestElegooTokenLive(region, token);
                return ser.Serialize(new Dictionary<string, object>
                {
                    { "ok", true },
                    { "region", region },
                    { "baseUrl", baseUrl },
                    { "token", token },
                    { "refreshToken", refreshToken },
                    { "user", userInfo }
                });
            }
            catch (Exception ex)
            {
                return ser.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", ex.Message } });
            }
        }

        private static void HandleCloudProxy(NetworkStream stream, string reqBody)
        {
            var ser = NewSerializer();
            try
            {
                var payload = ser.DeserializeObject(reqBody ?? "{}") as Dictionary<string, object>;
                string region = GetStr(payload, "region");
                if (string.IsNullOrEmpty(region)) region = "intl";
                string endpoint = GetStr(payload, "endpoint");
                string token = GetStr(payload, "token");

                if (string.IsNullOrWhiteSpace(token))
                {
                    WriteJsonResponse(stream, 401, "{\"code\":401,\"msg\":\"Missing token\"}");
                    return;
                }

                int qIdx = endpoint.IndexOf('?');
                string cleanEndpoint = (qIdx >= 0 ? endpoint.Substring(0, qIdx) : endpoint).Trim();
                if (!AllowedReadonlyEndpoints.Contains(cleanEndpoint))
                {
                    WriteJsonResponse(stream, 403, "{\"code\":403,\"msg\":\"Endpoint non consentito (solo lettura)\"}");
                    return;
                }

                string targetUrl = GetMatrixBaseUrl(region) + endpoint;
                HttpResult res = InvokeElegooHttp(targetUrl, "GET", null, token);
                WriteJsonResponse(stream, res.StatusCode, string.IsNullOrEmpty(res.Body) ? "{}" : res.Body);
            }
            catch (Exception ex)
            {
                WriteJsonResponse(stream, 500, ser.Serialize(new Dictionary<string, object> { { "code", 500 }, { "msg", ex.Message } }));
            }
        }

        // ====================================================================
        // MINIMAL LOOPBACK HTTP SERVER FOR UI RENDERING
        // ====================================================================
        private sealed class HttpRequestData
        {
            public string Method;
            public string RawPath;
            public Dictionary<string, string> Headers;
            public string Body;
        }

        private static HttpRequestData ReadHttpRequest(NetworkStream stream)
        {
            stream.ReadTimeout = 10000;
            List<byte> headerBytes = new List<byte>();
            int b1 = -1, b2 = -1, b3 = -1, b4 = -1;

            while (true)
            {
                int b = stream.ReadByte();
                if (b == -1) return null;
                headerBytes.Add((byte)b);
                b1 = b2; b2 = b3; b3 = b4; b4 = b;
                if (b1 == 13 && b2 == 10 && b3 == 13 && b4 == 10) break;
                if (headerBytes.Count > 65536) return null;
            }

            string headerStr = Encoding.ASCII.GetString(headerBytes.ToArray());
            string[] lines = headerStr.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            if (lines.Length == 0 || string.IsNullOrWhiteSpace(lines[0])) return null;

            string[] reqParts = lines[0].Split(' ');
            string method = reqParts[0].ToUpperInvariant();
            string rawPath = reqParts.Length > 1 ? reqParts[1] : "/";

            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 1; i < lines.Length; i++)
            {
                string line = lines[i];
                if (string.IsNullOrWhiteSpace(line)) continue;
                int colon = line.IndexOf(':');
                if (colon > 0)
                {
                    headers[line.Substring(0, colon).Trim()] = line.Substring(colon + 1).Trim();
                }
            }

            int contentLength = 0;
            if (headers.ContainsKey("Content-Length"))
            {
                int.TryParse(headers["Content-Length"], out contentLength);
            }

            string body = "";
            if (contentLength > 0 && contentLength < 16 * 1024 * 1024)
            {
                byte[] buf = new byte[contentLength];
                int total = 0;
                while (total < contentLength)
                {
                    int read = stream.Read(buf, total, contentLength - total);
                    if (read <= 0) break;
                    total += read;
                }
                body = Encoding.UTF8.GetString(buf, 0, total);
            }

            return new HttpRequestData
            {
                Method = method,
                RawPath = rawPath,
                Headers = headers,
                Body = body
            };
        }

        private static void ServeStaticFile(NetworkStream stream, string path)
        {
            string rel = string.IsNullOrWhiteSpace(path) || path == "/" ? "index.html" : path.TrimStart('/');
            rel = rel.Replace('/', '\\');
            if (rel.Contains(".."))
            {
                WriteHttpResponse(stream, 403, "Forbidden", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Forbidden"));
                return;
            }

            string fullPath = Path.GetFullPath(Path.Combine(_publicDir, rel));
            string fullPublic = Path.GetFullPath(_publicDir);
            if (!fullPath.StartsWith(fullPublic, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
            {
                WriteHttpResponse(stream, 404, "Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Not Found"));
                return;
            }

            string ext = Path.GetExtension(fullPath).ToLowerInvariant();
            string mime = "application/octet-stream";
            switch (ext)
            {
                case ".html": mime = "text/html; charset=utf-8"; break;
                case ".css": mime = "text/css; charset=utf-8"; break;
                case ".js": mime = "application/javascript; charset=utf-8"; break;
                case ".json": mime = "application/json; charset=utf-8"; break;
                case ".svg": mime = "image/svg+xml"; break;
                case ".png": mime = "image/png"; break;
                case ".jpg": mime = "image/jpeg"; break;
                case ".ico": mime = "image/x-icon"; break;
            }

            byte[] bytes = File.ReadAllBytes(fullPath);
            WriteHttpResponse(stream, 200, "OK", mime, bytes);
        }

        private static void WriteJsonResponse(NetworkStream stream, int statusCode, string json)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json ?? "{}");
            string statusText = statusCode == 200 ? "OK" : statusCode == 401 ? "Unauthorized" : statusCode == 403 ? "Forbidden" : "Error";
            WriteHttpResponse(stream, statusCode, statusText, "application/json; charset=utf-8", bytes);
        }

        private static void WriteHttpResponse(NetworkStream stream, int statusCode, string statusText, string contentType, byte[] bodyBytes)
        {
            if (bodyBytes == null) bodyBytes = new byte[0];
            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(statusCode).Append(' ').Append(statusText).Append("\r\n");
            sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
            sb.Append("Content-Length: ").Append(bodyBytes.Length).Append("\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            sb.Append("Connection: close\r\n\r\n");

            byte[] headerBytes = Encoding.ASCII.GetBytes(sb.ToString());
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0)
            {
                stream.Write(bodyBytes, 0, bodyBytes.Length);
            }
            stream.Flush();
        }

        // ====================================================================
        // HELPERS
        // ====================================================================
        private static JavaScriptSerializer NewSerializer()
        {
            var ser = new JavaScriptSerializer();
            ser.MaxJsonLength = int.MaxValue;
            ser.RecursionLimit = 64;
            return ser;
        }

        private static string GetStr(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return "";
            return Convert.ToString(dict[key]);
        }

        private static int GetInt(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return 0;
            try { return Convert.ToInt32(dict[key]); } catch { return 0; }
        }

        private static long GetInt64(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return 0L;
            try { return Convert.ToInt64(dict[key]); } catch { return 0L; }
        }

        private static bool GetBool(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return false;
            try { return Convert.ToBoolean(dict[key]); } catch { return false; }
        }

        private static bool IsPortOpen(string host, int port, int timeoutMs)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult res = client.BeginConnect(host, port, null, null);
                    bool success = res.AsyncWaitHandle.WaitOne(timeoutMs, false);
                    if (!success) return false;
                    client.EndConnect(res);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        private static string FindAppBrowserExecutable()
        {
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidates = new string[]
            {
                Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(localApp, "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string candidate in candidates)
            {
                if (!string.IsNullOrEmpty(candidate) && File.Exists(candidate))
                {
                    return candidate;
                }
            }
            return null;
        }
    }

    internal static class ElegooCrypto
    {
        private static readonly RNGCryptoServiceProvider Rng = new RNGCryptoServiceProvider();

        public static string RandomString(string chars, int length)
        {
            char[] buf = new char[length];
            byte[] rnd = new byte[length];
            Rng.GetBytes(rnd);
            for (int i = 0; i < length; i++)
            {
                buf[i] = chars[rnd[i] % chars.Length];
            }
            return new string(buf);
        }

        public static string AesEncryptBase64(string plainText, string keyStr, string ivStr)
        {
            byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] keyBytes = Encoding.UTF8.GetBytes(keyStr);
            byte[] ivBytes = Encoding.UTF8.GetBytes(ivStr);

            using (Aes aes = Aes.Create())
            {
                aes.KeySize = keyBytes.Length * 8;
                aes.BlockSize = 128;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                aes.Key = keyBytes;
                aes.IV = ivBytes;

                using (ICryptoTransform encryptor = aes.CreateEncryptor())
                {
                    byte[] cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
                    return Convert.ToBase64String(cipherBytes);
                }
            }
        }

        public static string RsaEncryptSpkiBase64(string plainText, string spkiBase64)
        {
            string cleaned = spkiBase64
                .Replace("-----BEGIN PUBLIC KEY-----", "")
                .Replace("-----END PUBLIC KEY-----", "")
                .Replace("\r", "")
                .Replace("\n", "")
                .Trim();

            byte[] spkiBytes = Convert.FromBase64String(cleaned);
            RSAParameters rsaParams = ParseSpkiPublicKey(spkiBytes);

            using (RSACryptoServiceProvider rsa = new RSACryptoServiceProvider())
            {
                rsa.ImportParameters(rsaParams);
                byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
                byte[] encrypted = rsa.Encrypt(plainBytes, false);
                return Convert.ToBase64String(encrypted);
            }
        }

        private static RSAParameters ParseSpkiPublicKey(byte[] der)
        {
            int idx = 0;
            ExpectTag(der, ref idx, 0x30);
            ReadLength(der, ref idx);

            ExpectTag(der, ref idx, 0x30);
            int algLen = ReadLength(der, ref idx);
            idx += algLen;

            ExpectTag(der, ref idx, 0x03);
            ReadLength(der, ref idx);
            idx += 1;

            ExpectTag(der, ref idx, 0x30);
            ReadLength(der, ref idx);

            ExpectTag(der, ref idx, 0x02);
            int modLen = ReadLength(der, ref idx);
            if (der[idx] == 0x00)
            {
                idx += 1;
                modLen -= 1;
            }
            byte[] modulus = new byte[modLen];
            Buffer.BlockCopy(der, idx, modulus, 0, modLen);
            idx += modLen;

            ExpectTag(der, ref idx, 0x02);
            int expLen = ReadLength(der, ref idx);
            if (der[idx] == 0x00)
            {
                idx += 1;
                expLen -= 1;
            }
            byte[] exponent = new byte[expLen];
            Buffer.BlockCopy(der, idx, exponent, 0, expLen);

            RSAParameters p = new RSAParameters();
            p.Modulus = modulus;
            p.Exponent = exponent;
            return p;
        }

        private static void ExpectTag(byte[] der, ref int idx, byte expected)
        {
            if (idx >= der.Length || der[idx] != expected)
                throw new InvalidDataException("Invalid ASN.1 tag at offset " + idx);
            idx++;
        }

        private static int ReadLength(byte[] der, ref int idx)
        {
            int b = der[idx++];
            if ((b & 0x80) == 0) return b;
            int numBytes = b & 0x7F;
            int len = 0;
            for (int i = 0; i < numBytes; i++)
            {
                len = (len << 8) | der[idx++];
            }
            return len;
        }

        private static int SkipWs(string s, int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
            return i;
        }

        private static int ScanStringEnd(string s, int startQuote)
        {
            int i = startQuote + 1;
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '\\' && i < s.Length) { i++; continue; }
                if (c == '"') return i;
            }
            return s.Length;
        }

        private static int ScanValueEnd(string s, int start)
        {
            if (start >= s.Length) return start;
            char first = s[start];
            if (first == '"') return ScanStringEnd(s, start);
            if (first == '{' || first == '[')
            {
                int depth = 0;
                int i = start;
                while (i < s.Length)
                {
                    char c = s[i];
                    if (c == '"') { i = ScanStringEnd(s, i); continue; }
                    if (c == '{' || c == '[') depth++;
                    else if (c == '}' || c == ']')
                    {
                        depth--;
                        if (depth == 0) return i + 1;
                    }
                    i++;
                }
                return s.Length;
            }
            int j = start;
            while (j < s.Length && s[j] != ',' && s[j] != '}' && s[j] != ']' && !char.IsWhiteSpace(s[j])) j++;
            return j;
        }

        public static string UpsertDbAuth(string dbJson, string authJson, long updatedAt)
        {
            string defaultDb = "{\"spools\":[],\"prints\":[],\"fileMetaCache\":{},\"liveSnapshotsByFile\":{},\"ignoredCloudTaskIds\":[],\"manuallyDeletedTaskIds\":[],\"auth\":" + authJson + ",\"updatedAt\":" + updatedAt + "}";
            if (string.IsNullOrWhiteSpace(dbJson)) return defaultDb;

            string s = dbJson.Trim();
            if (!s.StartsWith("{") || !s.EndsWith("}")) return defaultDb;

            try
            {
                List<string[]> pairs = new List<string[]>();
                int i = SkipWs(s, 1);
                if (i < s.Length && s[i] != '}')
                {
                    while (i < s.Length)
                    {
                        i = SkipWs(s, i);
                        if (i >= s.Length || s[i] != '"') return defaultDb;
                        int kEnd = ScanStringEnd(s, i);
                        string rawKey = s.Substring(i, kEnd - i);
                        string decodedKey = rawKey.Length >= 2 ? rawKey.Substring(1, rawKey.Length - 2) : rawKey;
                        i = SkipWs(s, kEnd);
                        if (i >= s.Length || s[i] != ':') return defaultDb;
                        i = SkipWs(s, i + 1);
                        int vEnd = ScanValueEnd(s, i);
                        string rawVal = s.Substring(i, vEnd - i);
                        pairs.Add(new string[] { rawKey, decodedKey, rawVal });
                        i = SkipWs(s, vEnd);
                        if (i < s.Length && s[i] == ',') { i++; continue; }
                        if (i < s.Length && s[i] == '}') break;
                        return defaultDb;
                    }
                }

                bool foundAuth = false;
                bool foundUpdated = false;
                for (int p = 0; p < pairs.Count; p++)
                {
                    if (pairs[p][1] == "auth") { pairs[p][2] = authJson; foundAuth = true; }
                    else if (pairs[p][1] == "updatedAt") { pairs[p][2] = updatedAt.ToString(); foundUpdated = true; }
                }
                if (!foundAuth) pairs.Insert(0, new string[] { "\"auth\"", "auth", authJson });
                if (!foundUpdated) pairs.Add(new string[] { "\"updatedAt\"", "updatedAt", updatedAt.ToString() });

                StringBuilder sb = new StringBuilder();
                sb.Append('{');
                for (int p = 0; p < pairs.Count; p++)
                {
                    if (p > 0) sb.Append(',');
                    sb.Append(pairs[p][0]).Append(':').Append(pairs[p][2]);
                }
                sb.Append('}');
                return sb.ToString();
            }
            catch
            {
                return defaultDb;
            }
        }
    }
}
