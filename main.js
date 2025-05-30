// Main process for Electron app
// ---------------------------------------------
// Handles window creation, dialogs, and download logic
// Uses Electron, Node.js, ytdlp-nodejs with optimized settings
//
// Key Features:
// - Video download hanging fix: Uses format selection instead of re-encoding
// - 1080p video quality limit to save disk space
// - Enhanced filename sanitization for Windows compatibility
// - Playlist support with individual video processing
// - Metadata extraction for artist/title information
// - Context menu support and comprehensive error handling
// ---------------------------------------------

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const ytdlp = require("ytdlp-nodejs");
const { spawn } = require("child_process");

// Import ffmpeg-static to get the bundled ffmpeg binary path
const ffmpegPath = require("ffmpeg-static");

// Helper: Sanitize filename for Windows compatibility
function sanitizeFilename(filename) {
  // Remove special characters and emojis, replace with underscore
  return filename
    .replace(/[\\/:*?"<>|]/g, "_") // Windows invalid characters
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "_") // Emoji surrogate pairs
    .replace(/[\u2600-\u27BF]/g, "_") // Unicode symbols and emojis
    .replace(/[^\x00-\x7F]/g, "_") // Non-ASCII characters
    .replace(/_+/g, "_") // Multiple underscores to single
    .replace(/^_|_$/g, ""); // Remove leading/trailing underscores
}

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
        let defaultName = type === "audio" ? "audio" : "video";
        let defaultExt = type === "audio" ? "webm" : "webm";

        if (!isPlaylist || !downloadAll) {
          // Get video info for filename (title only)
          try {
            const info = await getVideoInfo(url);
            if (info) {
              defaultName = sanitizeFilename(info);
              // No extension, let yt-dlp decide
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
            filters: [{ name: "All Media Files", extensions: ["*"] }],
          });
          if (canceled || !filePath) {
            mainWin.webContents.send("download-cancelled");
            return;
          }
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
}

// Download logic in main process
// Handles both single video downloads and playlist downloads
// Uses yt-dlp with specific quality limits and metadata extraction
ipcMain.on(
  "start-download-process",
  async (
    event,
    { savePath, url, type, isPlaylist, downloadAll, playlistLength }
  ) => {
    const ytDlpPath = getYtDlpPath();
    const ffmpegPath = getFfmpegPath();
    console.log("Using yt-dlp path:", ytDlpPath);
    console.log("Using ffmpeg path:", ffmpegPath);

    // Test the yt-dlp executable before proceeding
    try {
      const testProc = spawn(ytDlpPath, ["--version"]);
      testProc.on("error", (error) => {
        console.error("yt-dlp test failed:", error.message);
        console.error("Attempted path:", ytDlpPath);
        console.error("Process resourcesPath:", process.resourcesPath);
        console.error("App isPackaged:", app.isPackaged);
        console.error("Process execPath:", process.execPath);
        event.sender.send("download-complete", {
          success: false,
          message: `yt-dlp executable test failed at path: ${ytDlpPath}\n\nError: ${error.message}\n\nPlease ensure the app was built correctly with npm run build.`,
        });
        return;
      });
    } catch (testError) {
      console.error("yt-dlp spawn test failed:", testError.message);
      console.error("Attempted path:", ytDlpPath);
      event.sender.send("download-complete", {
        success: false,
        message: `Cannot start yt-dlp at path: ${ytDlpPath}\n\nError: ${testError.message}`,
      });
      return;
    }

    // Test the ffmpeg executable before proceeding
    try {
      const ffmpegTestProc = spawn(ffmpegPath, ["-version"]);
      ffmpegTestProc.on("error", (error) => {
        console.error("ffmpeg test failed:", error.message);
        console.error("Attempted ffmpeg path:", ffmpegPath);
        event.sender.send("download-complete", {
          success: false,
          message: `ffmpeg executable test failed at path: ${ffmpegPath}\n\nError: ${error.message}\n\nThis app requires ffmpeg for video/audio processing. Please ensure the app was built correctly with npm run build.`,
        });
        return;
      });
    } catch (ffmpegTestError) {
      console.error("ffmpeg spawn test failed:", ffmpegTestError.message);
      console.error("Attempted ffmpeg path:", ffmpegPath);
      event.sender.send("download-complete", {
        success: false,
        message: `Cannot start ffmpeg at path: ${ffmpegPath}\n\nError: ${ffmpegTestError.message}\n\nThis app requires ffmpeg for video/audio processing.`,
      });
      return;
    } // Verify the yt-dlp executable exists for non-system paths
    if (ytDlpPath !== "yt-dlp" && !fs.existsSync(ytDlpPath)) {
      console.error("yt-dlp binary not found at:", ytDlpPath);
      event.sender.send("download-complete", {
        success: false,
        message: `yt-dlp binary not found at: ${ytDlpPath}. Please ensure ytdlp-nodejs is properly installed.`,
      });
      return;
    }

    // Verify the ffmpeg executable exists for non-system paths
    if (ffmpegPath !== "ffmpeg" && !fs.existsSync(ffmpegPath)) {
      console.error("ffmpeg binary not found at:", ffmpegPath);
      event.sender.send("download-complete", {
        success: false,
        message: `ffmpeg binary not found at: ${ffmpegPath}. Please ensure ffmpeg-static is properly installed and bundled.`,
      });
      return;
    }

    try {
      // Playlist download logic
      if (isPlaylist && downloadAll) {
        // Step 1: Get all video URLs and titles from the playlist
        const procList = spawn(ytDlpPath, [
          url,
          "--flat-playlist",
          "--print",
          "%(title)s|%(id)s",
          "--yes-playlist",
          "--skip-download",
        ]);
        let videos = [];
        procList.stdout.on("data", (data) => {
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            const [title, id] = line.split("|");
            if (id) videos.push({ title: title || id, id });
          }
        });
        await new Promise((resolve) => procList.on("close", resolve));

        // Step 2: Download each video individually with progress tracking
        for (const video of videos) {
          event.sender.send("playlist-progress", {
            current: videos.indexOf(video) + 1,
          });
          event.sender.send("playlist-song-title", video.title);
          const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;

          // Step 3: Build download arguments with quality limits and metadata
          let outArgs = [
            videoUrl,
            "-o",
            path.join(
              savePath,
              type === "audio"
                ? "%(artist,uploader|Unknown Artist)s - %(title)s.mp3"
                : "%(artist,uploader|Unknown Artist)s - %(title)s.mp4"
            ),
            // Set ffmpeg location
            "--ffmpeg-location",
            ffmpegPath,
            // Audio conversion arguments
            type === "audio" ? "-x" : null,
            type === "audio" ? "--audio-format" : null,
            type === "audio" ? "mp3" : null,
            type === "audio" ? "--add-metadata" : null,
            type === "audio" ? "--metadata-from-title" : null,
            type === "audio" ? "%(artist)s - %(title)s" : null,
            // Video format selection with 1080p limit
            type === "video" ? "-f" : null,
            type === "video"
              ? "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b"
              : null,
            type === "video" ? "--add-metadata" : null,
            type === "video" ? "--metadata-from-title" : null,
            type === "video" ? "%(artist)s - %(title)s" : null,
            "--no-playlist",
          ].filter(Boolean);

          // Step 4: Execute download with progress reporting and error handling
          try {
            await new Promise((resolve, reject) => {
              const proc = spawn(ytDlpPath, outArgs);
              proc.stdout.on("data", (data) => {
                event.sender.send("download-progress", data.toString());
              });
              proc.stderr.on("data", (data) => {
                event.sender.send("download-progress", data.toString());
              });

              proc.on("close", (code) => {
                if (code === 0) {
                  resolve();
                } else {
                  reject(new Error(`Download failed with exit code: ${code}`));
                }
              });

              proc.on("error", (error) => {
                reject(error);
              });
            });
          } catch (error) {
            console.error(`Failed to download ${video.title}:`, error.message);
          }
        }

        // Send playlist download complete
        event.sender.send("download-complete", {
          success: true,
          message: "Playlist download complete!",
        });
      } else {
        // Single video download logic
        const outputPath = savePath; // Build download arguments
        const outArgs = [
          url,
          "-o",
          outputPath,
          // Set ffmpeg location
          "--ffmpeg-location",
          ffmpegPath,
          // Audio conversion arguments
          type === "audio" ? "-x" : null,
          type === "audio" ? "--audio-format" : null,
          type === "audio" ? "mp3" : null,
          type === "audio" ? "--add-metadata" : null,
          type === "audio" ? "--metadata-from-title" : null,
          type === "audio" ? "%(artist)s - %(title)s" : null,
          // Video format selection with 1080p limit
          type === "video" ? "-f" : null,
          type === "video"
            ? "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b"
            : null,
          type === "video" ? "--add-metadata" : null,
          type === "video" ? "--metadata-from-title" : null,
          type === "video" ? "%(artist)s - %(title)s" : null,
          "--no-playlist",
        ].filter(Boolean);

        // Execute download with progress reporting
        await new Promise((resolve, reject) => {
          const proc = spawn(ytDlpPath, outArgs);
          proc.stdout.on("data", (data) => {
            event.sender.send("download-progress", data.toString());
          });
          proc.stderr.on("data", (data) => {
            event.sender.send("download-progress", data.toString());
          });

          proc.on("close", (code) => {
            let fileExists = false;

            if (code === 0) {
              // Verify file was actually created
              if (fs.existsSync(outputPath)) {
                fileExists = true;
              } else {
                // Check for alternative filename patterns due to metadata extraction
                const dir = path.dirname(outputPath);
                const baseName = path.basename(
                  outputPath,
                  path.extname(outputPath)
                );
                const extension = path.extname(outputPath);

                // Look for files with similar names (metadata extraction might change filename)
                try {
                  const files = fs.readdirSync(dir);
                  for (const file of files) {
                    if (
                      file.includes(baseName.substring(0, 20)) &&
                      file.endsWith(extension)
                    ) {
                      fileExists = true;
                      break;
                    }
                  }
                } catch (err) {
                  console.error("Error checking directory:", err);
                }
              }
            }

            if (fileExists) {
              event.sender.send("download-complete", {
                success: true,
                message: `Downloaded: ${path.basename(outputPath)}`,
              });
              resolve();
            } else {
              const errorMsg =
                code === 0
                  ? "Download completed but file not found. It may have been downloaded with a different name."
                  : `Download failed with exit code: ${code}`;
              event.sender.send("download-complete", {
                success: false,
                message: errorMsg,
              });
              reject(new Error(errorMsg));
            }
          });

          proc.on("error", (error) => {
            event.sender.send("download-complete", {
              success: false,
              message: `Process error: ${error.message}`,
            });
            reject(error);
          });
        });
      }
    } catch (error) {
      event.sender.send("download-complete", {
        success: false,
        message: `Fatal error: ${error.message}`,
      });
    }
  }
);

// Helper function to get ffmpeg executable path
function getFfmpegPath() {
  try {
    // Check if we're running in production (packaged app)
    const isPackaged = app.isPackaged;

    if (isPackaged) {
      // In production, ffmpeg should be extracted to app.asar.unpacked
      const unpackedPath = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "ffmpeg-static",
        "ffmpeg.exe"
      );
      if (fs.existsSync(unpackedPath)) {
        console.log("Found ffmpeg at (unpacked):", unpackedPath);
        return unpackedPath;
      }

      // Alternative unpacked location
      const altUnpackedPath = path.join(
        path.dirname(process.execPath),
        "resources",
        "app.asar.unpacked",
        "node_modules",
        "ffmpeg-static",
        "ffmpeg.exe"
      );
      if (fs.existsSync(altUnpackedPath)) {
        console.log("Found ffmpeg at (alt unpacked):", altUnpackedPath);
        return altUnpackedPath;
      }
    }

    // Development mode: Use ffmpeg-static package directly
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      console.log("Found ffmpeg via ffmpeg-static:", ffmpegPath);
      return ffmpegPath;
    }

    // Fallback to system PATH
    console.log("Falling back to system PATH ffmpeg");
    return "ffmpeg";
  } catch (error) {
    console.error("Error getting ffmpeg path:", error);
    return "ffmpeg";
  }
}

// Helper function to get yt-dlp executable path
function getYtDlpPath() {
  try {
    // Check if we're running in production (packaged app)
    const isPackaged = app.isPackaged;

    if (isPackaged) {
      // In production, the binary is extracted to app.asar.unpacked
      const unpackedPath = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "ytdlp-nodejs",
        "bin",
        "yt-dlp.exe"
      );
      if (fs.existsSync(unpackedPath)) {
        console.log("Found yt-dlp at (unpacked):", unpackedPath);
        return unpackedPath;
      }

      // Alternative unpacked location
      const altUnpackedPath = path.join(
        path.dirname(process.execPath),
        "resources",
        "app.asar.unpacked",
        "node_modules",
        "ytdlp-nodejs",
        "bin",
        "yt-dlp.exe"
      );
      if (fs.existsSync(altUnpackedPath)) {
        console.log("Found yt-dlp at (alt unpacked):", altUnpackedPath);
        return altUnpackedPath;
      }

      // Check if binary was extracted to local bin folder
      const localUnpackedBin = path.join(
        path.dirname(process.execPath),
        "bin",
        "yt-dlp.exe"
      );
      if (fs.existsSync(localUnpackedBin)) {
        console.log("Found yt-dlp in local bin (unpacked):", localUnpackedBin);
        return localUnpackedBin;
      }
    }

    // Development mode: Direct path to the ytdlp-nodejs binary
    const directPath = path.join(
      __dirname,
      "node_modules",
      "ytdlp-nodejs",
      "bin",
      "yt-dlp.exe"
    );
    if (fs.existsSync(directPath)) {
      console.log("Found yt-dlp at:", directPath);
      return directPath;
    }

    // Try to use ytdlp-nodejs package methods
    try {
      const ytdlp = require("ytdlp-nodejs");
      const ytdlpInstance = new ytdlp.YtDlp();
      if (ytdlpInstance.binaryPath && fs.existsSync(ytdlpInstance.binaryPath)) {
        console.log(
          "Found yt-dlp via YtDlp instance:",
          ytdlpInstance.binaryPath
        );
        return ytdlpInstance.binaryPath;
      }
    } catch (instanceError) {
      console.log("Could not create YtDlp instance:", instanceError.message);
    }

    // Check for local bin directory
    const localBinary = path.join(__dirname, "bin", "yt-dlp.exe");
    if (fs.existsSync(localBinary)) {
      console.log("Found yt-dlp in local bin:", localBinary);
      return localBinary;
    }

    // Check other common locations
    const possiblePaths = [
      path.join(__dirname, "node_modules", ".bin", "yt-dlp.exe"),
      path.join(__dirname, "node_modules", ".bin", "yt-dlp"),
      path.join(__dirname, "yt-dlp.exe"),
      "yt-dlp.exe",
      "yt-dlp",
    ];

    for (const possiblePath of possiblePaths) {
      if (possiblePath.startsWith(path.sep) || possiblePath.includes(":")) {
        // Absolute path
        if (fs.existsSync(possiblePath)) {
          console.log("Found yt-dlp at:", possiblePath);
          return possiblePath;
        }
      }
    }

    console.log("Falling back to system PATH yt-dlp");
    return "yt-dlp";
  } catch (error) {
    console.error("Error getting yt-dlp path:", error);
    return "yt-dlp";
  }
}

// Helper function to get video info
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), [
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
    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        reject(new Error("Failed to get video info"));
      }
    });
  });
}

// Helper function to get playlist length
async function getPlaylistLength(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), [
      url,
      "--flat-playlist",
      "--print",
      "%(id)s",
      "--yes-playlist",
      "--skip-download",
    ]);
    let count = 0;
    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n").filter(Boolean);
      count += lines.length;
    });
    proc.on("close", (code) => {
      resolve(count);
    });
  });
}

// Handle video info requests
ipcMain.handle("get-video-info", async (event, url) => {
  try {
    const info = await getVideoInfo(url);
    return { success: true, info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App initialization
app.whenReady().then(() => {
  // Show disclaimer first
  const disclaimerWin = createDisclaimerWindow();

  // Handle disclaimer events
  ipcMain.on("disclaimer-accepted", () => {
    disclaimerWin.close();
    createMainWindow();
  });

  ipcMain.on("disclaimer-closed", () => {
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
