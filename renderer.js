// Renderer process for Electron app
// ---------------------------------------------
// Handles UI logic, theme switching, dialogs, and download triggers
// Communicates with main process via IPC
// ---------------------------------------------

const { ipcRenderer, remote } = require("electron");
const ytdlp = require("ytdlp-nodejs");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

// Theme toggle logic
const themeToggle = document.getElementById("themeToggle");
themeToggle.addEventListener("change", () => {
  document.body.classList.toggle("light-theme", themeToggle.checked);
  document.body.classList.toggle("dark-theme", !themeToggle.checked);
});

// Audio/Video switch logic
const dlTypeSwitch = document.getElementById("dlTypeSwitch");
const audioLabel = document.getElementById("audioLabel");
const videoLabel = document.getElementById("videoLabel");
let downloadType = "audio";

dlTypeSwitch.addEventListener("change", () => {
  if (dlTypeSwitch.checked) {
    downloadType = "video";
    videoLabel.classList.add("selected");
    audioLabel.classList.remove("selected");
  } else {
    downloadType = "audio";
    audioLabel.classList.add("selected");
    videoLabel.classList.remove("selected");
  }
});
// Set default
audioLabel.classList.add("selected");
videoLabel.classList.remove("selected");

// Download button and input
const downloadBtn = document.getElementById("downloadBtn");
const ytUrlInput = document.getElementById("ytUrl");
const playlistMsg = document.getElementById("playlistMsg");

// Helper: Validate YouTube URL
function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

// Helper: Detect playlist
function isPlaylistUrl(url) {
  return /[?&]list=/.test(url);
}

// Helper: Show styled error popup
function showError(msg) {
  showMaterialDialog(msg, ["OK"], () => {}, { spinner: false });
}

// Fetch video info for default filename
async function getDefaultFilename(url, type) {
  const res = await ipcRenderer.invoke("get-video-info", url);
  if (res.success) {
    return (res.info + (type === "audio" ? ".mp3" : ".mp4")).replace(
      /[\\/:*?"<>|]/g,
      "_"
    );
  }
  return type === "audio" ? "audio.mp3" : "video.mp4";
}

// Download button click
downloadBtn.onclick = async () => {
  const url = ytUrlInput.value.trim();
  if (!url) {
    showError("Please enter a YouTube link.");
    return;
  }
  if (!isValidYouTubeUrl(url)) {
    showError("Invalid YouTube link provided.");
    return;
  }
  const isPlaylist = isPlaylistUrl(url);
  if (isPlaylist) {
    playlistMsg.style.display = "none";
    showPlaylistOptions(url);
    return;
  } else {
    playlistMsg.style.display = "none";
    removePlaylistOptions();
  }
  showLoadingDialog();
  ipcRenderer.send("start-download", {
    url,
    type: downloadType,
    isPlaylist: false,
    downloadAll: false,
  });
};

function showMaterialDialog(message, buttons, callback, opts = {}) {
  let dialog = document.getElementById("materialDialog");
  if (dialog) dialog.remove();
  document.body.classList.add("md-blur");
  dialog = document.createElement("div");
  dialog.id = "materialDialog";
  dialog.innerHTML = `
    <div class="md-overlay"></div>
    <div class="md-dialog">
      <div class="md-message">${message}</div>
      <div class="md-actions">
        ${buttons
          .map(
            (b, i) =>
              `<button class="md-btn md-theme-btn" data-idx="${i}">${b}</button>`
          )
          .join("")}
      </div>
      ${opts.spinner ? '<div class="loader"></div>' : ""}
    </div>
  `;
  document.body.appendChild(dialog);
  setTimeout(() => dialog.classList.remove("md-hide"), 10);
  document.querySelectorAll(".md-btn").forEach((btn) => {
    btn.onclick = (e) => {
      dialog.classList.add("md-hide");
      setTimeout(() => {
        dialog.remove();
        document.body.classList.remove("md-blur");
        callback && callback(parseInt(btn.dataset.idx));
      }, 180);
    };
  });
}

function showPlaylistOptions(url) {
  removePlaylistOptions();
  showMaterialDialog(
    "The provided link is a playlist. What would you like to do?",
    ["Download this song only", "Download entire playlist", "Cancel"],
    (idx) => {
      if (idx === 0) {
        showLoadingDialog();
        ipcRenderer.send("start-download", {
          url,
          type: downloadType,
          isPlaylist: true,
          downloadAll: false,
        });
      } else if (idx === 1) {
        showLoadingDialog();
        ipcRenderer.send("start-download", {
          url,
          type: downloadType,
          isPlaylist: true,
          downloadAll: true,
        });
      } else {
        document.body.classList.remove("md-blur");
      }
    }
  );
}

function showLoadingDialog() {
  showMaterialDialog(
    '<div class="downloading-text animated-dots">Loading</div>',
    [],
    null,
    { spinner: true }
  );
}

function removePlaylistOptions() {
  const existing = document.getElementById("playlistOptions");
  if (existing) existing.remove();
}

let playlistTotal = 0;
let playlistCurrent = 0;
let isPlaylistDownload = false;

// Listen for download path selection
ipcRenderer.on(
  "download-path-selected",
  (event, { savePath, url, type, isPlaylist, downloadAll, playlistLength }) => {
    if (!savePath) {
      document.body.classList.remove("md-blur");
      return;
    }
    // Start download in main process
    isPlaylistDownload = isPlaylist && downloadAll;
    playlistTotal = playlistLength || 0;
    playlistCurrent = 0;
    ipcRenderer.send("start-download-process", {
      savePath,
      url,
      type,
      isPlaylist,
      downloadAll,
      playlistLength,
    });
    showProgressPopup(isPlaylistDownload, playlistTotal, playlistCurrent);
  }
);

// Track finished downloads for playlist
let playlistFinished = 0;
ipcRenderer.on("download-complete", () => {
  if (isPlaylistDownload) {
    playlistFinished = playlistCurrent;
    const progress = document.getElementById("playlistProgress");
    if (progress)
      progress.textContent = `${playlistFinished} of ${playlistTotal} songs downloaded.`;
  }
  hideProgressPopup();
  showCompletionDialog();
  ytUrlInput.value = "";
});

ipcRenderer.on("download-error", (event, msg) => {
  hideProgressPopup();
  showError(msg || "Unknown Error!");
  resetUI();
});

// Download logic
async function startDownload({ savePath, url, type, isPlaylist, downloadAll }) {
  // Show progress UI
  showProgressUI(isPlaylist && downloadAll);
  try {
    if (isPlaylist && downloadAll) {
      // Download entire playlist
      await downloadPlaylist(url, savePath, type);
    } else {
      // Download single video/audio
      await downloadSingle(url, savePath, type);
    }
    showCompletionDialog();
  } catch (err) {
    showError(err.message || "Unknown Error!");
    resetUI();
  }
}

function showProgressPopup(isPlaylist, playlistTotal = 0, playlistCurrent = 0) {
  let dialog = document.getElementById("materialDialog");
  if (dialog) dialog.remove();
  document.body.classList.add("md-blur");
  dialog = document.createElement("div");
  dialog.id = "materialDialog";
  dialog.innerHTML = `
    <div class="md-overlay"></div>
    <div class="md-dialog">
      <div class="loader"></div>
      <div class="downloading-text animated-dots">Downloading</div>
    </div>
  `;
  document.body.appendChild(dialog);
}

function hideProgressPopup() {
  document.body.classList.remove("md-blur");
  let dialog = document.getElementById("materialDialog");
  if (dialog) dialog.remove();
}

function showCompletionDialog() {
  showMaterialDialog(
    "Download Complete!",
    ["OK"],
    () => {
      document.body.classList.remove("md-blur");
      ytUrlInput.value = "";
    },
    { spinner: false }
  );
}

function resetUI() {
  window.location.reload();
}

// Download helpers
async function downloadSingle(url, savePath, type) {
  // Use ytdlp-nodejs to download single video/audio
  return new Promise((resolve, reject) => {
    ytdlp.exec(
      url,
      [
        "-o",
        savePath,
        ...(type === "audio"
          ? ["-x", "--audio-format", "mp3", "--ffmpeg-location", ffmpegPath]
          : ["--ffmpeg-location", ffmpegPath]),
      ],
      { shell: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve();
      }
    );
  });
}

async function downloadPlaylist(url, folderPath, type) {
  // Use ytdlp-nodejs to download entire playlist
  return new Promise((resolve, reject) => {
    ytdlp.exec(
      url,
      [
        "-o",
        path.join(folderPath, "%(title)s.%(ext)s"),
        ...(type === "audio"
          ? ["-x", "--audio-format", "mp3", "--ffmpeg-location", ffmpegPath]
          : ["--ffmpeg-location", ffmpegPath]),
        "--yes-playlist",
      ],
      { shell: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve();
      }
    );
  });
}

ipcRenderer.on("download-progress", (event, msg) => {
  // Try to extract percent from yt-dlp output
  const percentMatch = msg.match(/\b(\d{1,3}\.\d)%/);
  const bar = document.getElementById("progressBarInner");
  const status = document.getElementById("progressStatus");
  if (bar && percentMatch) {
    bar.style.width = percentMatch[1] + "%";
  }
  if (status) status.textContent = msg.split("\n").pop();
});

// Typewriter animation for 'Download БРЕ!'
function typeWriterEffect(text, elementId, speed = 160) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = "";
  el.style.borderRight = "2px solid";
  // Set color for cursor based on theme
  if (document.body.classList.contains("light-theme")) {
    el.style.color = "#888";
    el.style.borderRightColor = "#888";
  } else {
    el.style.color = "#f5f5f5";
    el.style.borderRightColor = "#f5f5f5";
  }
  let i = 0;
  function type() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i++;
      setTimeout(type, speed);
    } else {
      // Remove cursor after animation
      el.style.borderRight = "none";
    }
  }
  type();
}
document.addEventListener("DOMContentLoaded", () => {
  typeWriterEffect("Download БРЕ!", "typewriterText", 160);
});

// Update typewriter color and cursor on theme change
const typewriterText = document.getElementById("typewriterText");
if (typewriterText) {
  themeToggle.addEventListener("change", () => {
    if (document.body.classList.contains("light-theme")) {
      typewriterText.style.color = "#888";
      typewriterText.style.borderRightColor = "#888";
    } else {
      typewriterText.style.color = "#f5f5f5";
      typewriterText.style.borderRightColor = "#f5f5f5";
    }
  });
}

// Set Poppins font for all elements
document.addEventListener("DOMContentLoaded", () => {
  document.body.style.fontFamily = "'Poppins', Arial, sans-serif";
  const all = document.querySelectorAll("*");
  all.forEach((el) => {
    el.style.fontFamily = "'Poppins', Arial, sans-serif";
  });
});
