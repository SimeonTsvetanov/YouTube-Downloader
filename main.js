// Main process for Electron app
// ---------------------------------------------
// Handles window creation, dialogs, and download logic
// Uses Electron, Node.js, ytdlp-nodejs, ffmpeg-static
// ---------------------------------------------

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const ytdlp = require("ytdlp-nodejs");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");

// Helper: Show error dialog
function showError(win, message) {
  dialog.showMessageBox(win, {
    type: "error",
    title: "Error",
    message,
    buttons: ["OK"],
    icon: path.join(__dirname, "icons", "icon.png"),
  });
}

// Create the disclaimer window (shown on app start)
function createDisclaimerWindow() {
  const disclaimerWin = new BrowserWindow({
    width: 400,
    height: 220,
    resizable: false,
    frame: false,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  disclaimerWin.loadFile("disclaimer.html");
  disclaimerWin.once("ready-to-show", () => {
    disclaimerWin.center();
    disclaimerWin.show();
  });
  return disclaimerWin;
}

// Create the main app window
function createMainWindow() {
  const mainWin = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 350,
    minHeight: 500,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, "icons", "icon.ico"),
    autoHideMenuBar: true, // Hide the default menu bar
  });
  mainWin.setMenuBarVisibility(false); // Ensure menu bar is hidden
  mainWin.loadFile("index.html");
  mainWin.once("ready-to-show", () => {
    mainWin.show();
  });

  // Handle download requests from renderer
  mainWin.webContents.on("ipc-message", async (event, channel, ...args) => {
    if (channel === "start-download") {
      const { url, type, isPlaylist, downloadAll } = args[0];
      let savePath;
      try {
        let defaultName = type === "audio" ? "audio.mp3" : "video.mp4";
        if (!isPlaylist || !downloadAll) {
          // Get video info for filename (title only)
          try {
            const info = await getVideoInfo(url);
            if (info) {
              defaultName =
                info.replace(/[\\/:*?"<>|]/g, "_") +
                (type === "audio" ? ".mp3" : ".mp4");
            }
          } catch {}
        }
        let playlistLength = 0;
        if (isPlaylist && downloadAll) {
          playlistLength = await getPlaylistLength(url);
          const { filePaths, canceled } = await dialog.showOpenDialog(mainWin, {
            title: "Select folder to save playlist",
            properties: ["openDirectory"],
          });
          if (canceled || !filePaths || !filePaths[0]) return;
          savePath = filePaths[0];
        } else {
          const { filePath, canceled } = await dialog.showSaveDialog(mainWin, {
            title: "Save file as",
            defaultPath: defaultName,
            filters: [
              {
                name: type === "audio" ? "MP3 Audio" : "MP4 Video",
                extensions: [type === "audio" ? "mp3" : "mp4"],
              },
            ],
          });
          if (canceled || !filePath) return;
          savePath = filePath;
        }
        mainWin.webContents.send("download-path-selected", {
          savePath,
          url,
          type,
          isPlaylist,
          downloadAll,
          playlistLength,
        });
      } catch (err) {
        showError(mainWin, "File dialog error.");
      }
    }
  });

  // Download logic in main process
  ipcMain.on(
    "start-download-process",
    async (
      event,
      { savePath, url, type, isPlaylist, downloadAll, playlistLength }
    ) => {
      const ytDlpPath = getYtDlpPath();
      let args = [];
      if (isPlaylist && downloadAll) {
        args = [
          url,
          "-o",
          path.join(savePath, "%(title)s.%(ext)s"),
          ...(type === "audio"
            ? ["-x", "--audio-format", "mp3", "--ffmpeg-location", ffmpegPath]
            : ["--ffmpeg-location", ffmpegPath]),
          "--yes-playlist",
        ];
      } else {
        args = [
          url,
          "-o",
          savePath,
          ...(type === "audio"
            ? ["-x", "--audio-format", "mp3", "--ffmpeg-location", ffmpegPath]
            : ["--ffmpeg-location", ffmpegPath]),
          "--no-playlist",
        ];
      }
      let currentSong = 0;
      event.sender.send("playlist-total", playlistLength || 0);
      const proc = spawn(ytDlpPath, args);
      proc.stdout.on("data", (data) => {
        const str = data.toString();
        // Detect new song download in playlist
        if (isPlaylist && downloadAll) {
          // yt-dlp prints "[download] Downloading video X of Y"
          const match = str.match(/Downloading video (\d+) of (\d+)/);
          if (match) {
            currentSong = parseInt(match[1]);
            event.sender.send("playlist-progress", { current: currentSong });
          }
        }
        event.sender.send("download-progress", str);
      });
      proc.stderr.on("data", (data) => {
        event.sender.send("download-progress", data.toString());
      });
      proc.on("close", (code) => {
        if (code === 0) {
          event.sender.send("download-complete");
        } else {
          event.sender.send("download-error", "Download failed!");
        }
      });
    }
  );
  return mainWin;
}

// Helper: Get yt-dlp binary path from ytdlp-nodejs
function getYtDlpPath() {
  // Always resolve directly to the binary in node_modules
  return path.join(
    __dirname,
    "node_modules",
    "ytdlp-nodejs",
    "bin",
    "yt-dlp.exe"
  );
}

// Helper: Get video info (title only) using yt-dlp
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytDlpPath = getYtDlpPath();
    const proc = spawn(ytDlpPath, [
      url,
      "--print",
      "%(title)s",
      "--no-playlist",
      "--skip-download",
    ]);
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {});
    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        resolve(null); // fallback to default name
      }
    });
  });
}

// Helper: Get playlist length using yt-dlp
async function getPlaylistLength(url) {
  return new Promise((resolve, reject) => {
    const ytDlpPath = getYtDlpPath();
    const proc = spawn(ytDlpPath, [
      url,
      "--flat-playlist",
      "--print",
      "%(id)s",
      "--yes-playlist",
      "--skip-download",
    ]);
    let count = 0;
    proc.stdout.on("data", (data) => {
      count += data.toString().split("\n").filter(Boolean).length;
    });
    proc.stderr.on("data", (data) => {});
    proc.on("close", (code) => {
      resolve(count);
    });
  });
}

// IPC handler for video info
ipcMain.handle("get-video-info", async (event, url) => {
  try {
    const info = await getVideoInfo(url);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// App ready event
app.whenReady().then(() => {
  let disclaimerWin = createDisclaimerWindow();
  let mainWin = null;

  ipcMain.on("disclaimer-accepted", () => {
    disclaimerWin.close();
    mainWin = createMainWindow();
  });
  ipcMain.on("disclaimer-closed", () => {
    disclaimerWin.close();
    app.quit();
  });

  ipcMain.handle("show-error", (event, message) => {
    showError(BrowserWindow.getFocusedWindow(), message);
  });
});

// Quit app when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
