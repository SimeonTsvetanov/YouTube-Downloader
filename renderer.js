// Renderer process for Electron app
// ---------------------------------------------
// Handles UI logic, theme switching, dialogs, and download triggers
// Communicates with main process via IPC
// ---------------------------------------------

const { ipcRenderer, remote } = require("electron");
const ytdlp = require("ytdlp-nodejs");
const path = require("path");
const fs = require("fs");

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

// Theme toggle logic
const themeToggle = document.getElementById("themeToggle");

// Set default to dark theme
themeToggle.checked = false;
document.body.classList.add("dark-theme");
document.body.classList.remove("light-theme");

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

// Context menu for URL input field
ytUrlInput.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  // Remove any existing menu
  const oldMenu = document.getElementById("customContextMenu");
  if (oldMenu) oldMenu.remove();

  // Create custom context menu
  const menu = document.createElement("div");
  menu.id = "customContextMenu";
  menu.style.cssText = `
    position: fixed;
    left: ${e.clientX}px;
    top: ${e.clientY}px;
    background: ${
      document.body.classList.contains("light-theme") ? "#fff" : "#232323"
    };
    color: ${document.body.classList.contains("light-theme") ? "#222" : "#fff"};
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    padding: 6px 0;
    z-index: 2000;
    min-width: 120px;
    font-family: Poppins, Arial, sans-serif;
    font-size: 0.9rem;
    border: 1px solid ${
      document.body.classList.contains("light-theme") ? "#ddd" : "#444"
    };
  `;

  const menuItems = [
    { label: "Cut", action: "cut" },
    { label: "Copy", action: "copy" },
    { label: "Paste", action: "paste" },
    { label: "---", action: "separator" },
    { label: "Select All", action: "selectAll" },
    { label: "Delete", action: "delete" },
  ];

  menuItems.forEach((item) => {
    if (item.action === "separator") {
      const separator = document.createElement("div");
      separator.style.cssText = `
        height: 1px;
        background: ${
          document.body.classList.contains("light-theme") ? "#eee" : "#444"
        };
        margin: 4px 8px;
      `;
      menu.appendChild(separator);
      return;
    }

    const menuItem = document.createElement("div");
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: background 0.15s;
    `;

    menuItem.onmouseenter = () => {
      menuItem.style.background = document.body.classList.contains(
        "light-theme"
      )
        ? "#f0f0f0"
        : "#333";
    };
    menuItem.onmouseleave = () => {
      menuItem.style.background = "";
    };

    menuItem.onclick = async () => {
      ytUrlInput.focus();

      switch (item.action) {
        case "cut":
          if (ytUrlInput.selectionStart !== ytUrlInput.selectionEnd) {
            const selectedText = ytUrlInput.value.substring(
              ytUrlInput.selectionStart,
              ytUrlInput.selectionEnd
            );
            await navigator.clipboard.writeText(selectedText);
            ytUrlInput.value =
              ytUrlInput.value.substring(0, ytUrlInput.selectionStart) +
              ytUrlInput.value.substring(ytUrlInput.selectionEnd);
          }
          break;

        case "copy":
          if (ytUrlInput.selectionStart !== ytUrlInput.selectionEnd) {
            const selectedText = ytUrlInput.value.substring(
              ytUrlInput.selectionStart,
              ytUrlInput.selectionEnd
            );
            await navigator.clipboard.writeText(selectedText);
          } else {
            await navigator.clipboard.writeText(ytUrlInput.value);
          }
          break;

        case "paste":
          try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) {
              const startPos = ytUrlInput.selectionStart;
              const endPos = ytUrlInput.selectionEnd;
              ytUrlInput.value =
                ytUrlInput.value.substring(0, startPos) +
                clipboardText +
                ytUrlInput.value.substring(endPos);
              ytUrlInput.setSelectionRange(
                startPos + clipboardText.length,
                startPos + clipboardText.length
              );
            }
          } catch (err) {
            console.log("Paste failed:", err);
          }
          break;

        case "selectAll":
          ytUrlInput.select();
          break;

        case "delete":
          if (ytUrlInput.selectionStart !== ytUrlInput.selectionEnd) {
            ytUrlInput.value =
              ytUrlInput.value.substring(0, ytUrlInput.selectionStart) +
              ytUrlInput.value.substring(ytUrlInput.selectionEnd);
          } else {
            ytUrlInput.value = "";
          }
          break;
      }

      menu.remove();
    };

    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  // Remove menu on click elsewhere
  setTimeout(() => {
    const handleClick = (event) => {
      if (!menu.contains(event.target)) {
        menu.remove();
        document.removeEventListener("click", handleClick);
      }
    };
    document.addEventListener("click", handleClick);
  }, 10);
});

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
    return sanitizeFilename(res.info) + (type === "audio" ? ".mp3" : ".mp4");
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

  // Determine theme colors
  const isLightTheme = document.body.classList.contains("light-theme");
  const dialogBg = isLightTheme ? "#fff" : "#232323";
  const dialogColor = isLightTheme ? "#222" : "#fff";
  const overlayBg = isLightTheme
    ? "rgba(120, 120, 120, 0.15)"
    : "rgba(30, 30, 30, 0.18)";

  dialog = document.createElement("div");
  dialog.id = "materialDialog";
  dialog.innerHTML = `
    <div class="md-overlay" style="background: ${overlayBg};"></div>
    <div class="md-dialog" style="background: ${dialogBg}; color: ${dialogColor};">
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
    "The provided link is a playlist. Would you like to Download this file only or the entire playlist?",
    ["File", "Playlist", "Cancel"],
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
let failedSongs = [];
let lastFailedTitle = null;

// Listen for download path selection
ipcRenderer.on(
  "download-path-selected",
  (event, { savePath, url, type, isPlaylist, downloadAll, playlistLength }) => {
    if (!savePath) {
      document.body.classList.remove("md-blur");
      hideProgressPopup();
      resetUI();
      return;
    }
    // Start download in main process
    isPlaylistDownload = isPlaylist && downloadAll;
    playlistTotal = playlistLength || 0;
    playlistCurrent = 0;
    failedSongs = [];
    lastFailedTitle = null;
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

ipcRenderer.on("download-cancelled", () => {
  document.body.classList.remove("md-blur");
  hideProgressPopup();
  resetUI();
});

// Track finished downloads for playlist
let playlistFinished = 0;
ipcRenderer.on("download-complete", () => {
  console.log("[Renderer] download-complete event received");
  setTimeout(() => {
    // Fallback: force show dialog if not visible
    if (!document.getElementById("materialDialog")) {
      showCompletionDialog();
    }
  }, 500);
  if (isPlaylistDownload) {
    playlistFinished = playlistCurrent;
    const progress = document.getElementById("playlistProgress");
    if (progress)
      progress.textContent = `${playlistFinished} of ${playlistTotal} songs downloaded.`;
  }
  hideProgressPopup();
  showCompletionDialog();
});

ipcRenderer.on("download-error", (event, msg) => {
  // If in playlist mode, skip this song and continue
  if (isPlaylistDownload && lastFailedTitle) {
    failedSongs.push(lastFailedTitle);
    lastFailedTitle = null;
    // Simulate progress for skipped song
    playlistCurrent++;
    if (playlistCurrent < playlistTotal) {
      // Continue to next song (main process should handle this, but if not, trigger next)
      // No-op: main process should already be handling next song
      return;
    }
  }
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

  // Determine theme colors
  const isLightTheme = document.body.classList.contains("light-theme");
  const dialogBg = isLightTheme ? "#fff" : "#232323";
  const dialogColor = isLightTheme ? "#222" : "#fff";
  const overlayBg = isLightTheme
    ? "rgba(120, 120, 120, 0.15)"
    : "rgba(30, 30, 30, 0.18)";

  dialog = document.createElement("div");
  dialog.id = "materialDialog";
  dialog.innerHTML = `
    <div class="md-overlay" style="background: ${overlayBg};"></div>
    <div class="md-dialog" style="background: ${dialogBg}; color: ${dialogColor};">
      <div class="loader"></div>
      <div class="downloading-text animated-dots" style="color: ${dialogColor};">Downloading</div>
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
  let message = "Download Complete!";
  if (isPlaylistDownload && failedSongs.length > 0) {
    message += `<div style='margin-top:12px;font-size:0.98rem;color:#ffd600;'>Didn't manage to download <b>${failedSongs.length}</b> song(s):</div>`;
    message += `<div class='failed-list' style='max-height:120px;overflow:auto;margin:10px 0 0 0;padding:0 2px 0 2px;border-radius:7px;'>`;
    message += failedSongs
      .map(
        (title) =>
          `<div style='font-size:0.93rem;padding:3px 0 3px 0;color:#e53935;'>${title}</div>`
      )
      .join("");
    message += `</div>`;
  }
  showMaterialDialog(
    message,
    ["OK"],
    () => {
      document.body.classList.remove("md-blur");
      ytUrlInput.value = "";
      failedSongs = [];
      lastFailedTitle = null;
    },
    { spinner: false }
  );
  // Style failed-list scroll for Material look
  setTimeout(() => {
    const failedList = document.querySelector(".failed-list");
    if (failedList) {
      failedList.style.scrollbarWidth = "thin";
      failedList.style.scrollbarColor = "#ffd600 #232323";
      // Set background based on current theme
      failedList.style.background = document.body.classList.contains(
        "light-theme"
      )
        ? "#f1f3f4"
        : "rgba(40,40,40,0.10)";
    }
  }, 100);
}

// Download helpers
async function downloadSingle(url, savePath, type) {
  // Use ytdlp-nodejs to download single video/audio in original format
  return new Promise((resolve, reject) => {
    const args = [
      "-o",
      type === "audio"
        ? savePath.replace(/\.[^.]+$/, ".mp3")
        : savePath.replace(/\.[^.]+$/, ".mp4"),
      ...(type === "audio"
        ? [
            "-x",
            "--audio-format",
            "mp3",
            "--add-metadata",
            "--metadata-from-title",
            "%(artist)s - %(title)s",
          ]
        : [
            "--recode-video",
            "mp4",
            "--add-metadata",
            "--metadata-from-title",
            "%(artist)s - %(title)s",
          ]),
      url,
      "--no-playlist",
    ];
    ytdlp.exec(url, args, { shell: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

async function downloadPlaylist(url, folderPath, type) {
  // Use ytdlp-nodejs to download entire playlist in original format
  return new Promise((resolve, reject) => {
    ytdlp.exec(
      url,
      [
        "-o",
        path.join(folderPath, "%(title)s.%(ext)s"),
        ...(type === "audio" ? ["-x"] : []),
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

ipcRenderer.on("playlist-song-title", (event, title) => {
  lastFailedTitle = title;
});
