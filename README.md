# [YouTube Downloader](https://drive.google.com/drive/folders/1YtY79mBeIS6k_Dr7gJkJLtl5acal9ZP5?usp=drive_link)

A modern YouTube Downloader desktop app built with Electron, Node.js, HTML, CSS, and JavaScript for **Windows only**.

**App Screenshots (Dark & Light Mode):**

![Dark mode](screenshot-dark.png)
![Light mode](screenshot-light.png)

---

## 🖥️ Platform Support

**Currently Windows Only** - This application is specifically designed and optimized for Windows 10 and Windows 11. Mac and Linux support may be added in future releases.

---

## ✨ Features

- **Download YouTube videos as MP4 (max 1080p resolution)**
- **Download YouTube audio as MP3 (high quality)**
- Playlist detection and batch download support
- Modern Material Design UI with dark/light theme
- Progress feedback and clear dialogs
- Filename sanitization for Windows compatibility
- All dependencies bundled (no Python or ffmpeg install required)
- Context menu support for URL input (copy/paste/delete)

---

## 📥 Download & Install

### **Windows Installer (Recommended)**

📦 **[Download Latest Release](https://drive.google.com/drive/folders/1YtY79mBeIS6k_Dr7gJkJLtl5acal9ZP5?usp=drive_link)**

1. Click the link above to access the download folder
2. Download the latest Windows installer (`.exe` file)
3. Run the installer and follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

**System Requirements:**

- Windows 10 or Windows 11
- 100MB free disk space
- Internet connection for downloads

---

## 📁 File Types & Quality

### **Audio Downloads**

- **Format**: MP3 only
- **Quality**: High quality audio extraction from source
- **Metadata**: Includes artist and title information when available
- **Filename**: `Artist - Title.mp3`

### **Video Downloads**

- **Format**: MP4 only
- **Quality**: Maximum 1080p resolution (saves disk space)
- **Codec**: H.264 video with AAC audio
- **Filename**: `Artist - Title.mp4`

---

## 🚀 How to Use

1. **Paste YouTube URL** - Copy any YouTube video or playlist link
2. **Choose Format** - Toggle between Audio (MP3) or Video (MP4)
3. **Click Download** - Select save location and start download
4. **Wait for Completion** - Progress dialog shows download status

**Supported URLs:**

- Individual videos: `https://youtube.com/watch?v=...`
- Playlists: `https://youtube.com/playlist?list=...`
- Shortened links: `https://youtu.be/...`

---

## 📁 Project Structure

```text
├── disclaimer.html         # Disclaimer popup
├── index.html              # Main UI
├── main.js                 # Electron main process
├── renderer.js             # Renderer process (UI logic)
├── style.css               # App styles
├── package.json            # Project config
├── icons/                  # App icons (logo, .ico)
│   ├── icon.ico
│   ├── youtube_downloader_logo.png
│   └── README.txt
├── screenshot-dark.png     # App screenshot (dark mode)
├── screenshot-light.png    # App screenshot (light mode)
└── dist/                   # Build output (not in repo)
```

---

## ⚖️ Legal Disclaimer

**⚠️ IMPORTANT: Educational Use Only**

This software is provided for **educational and personal use only**. By downloading and using this application, you acknowledge and agree that:

- You are responsible for complying with YouTube's Terms of Service
- You will only download content you have the legal right to download
- You will not use this software for commercial purposes
- You will not distribute copyrighted content without proper authorization
- The developer is not liable for any misuse of this software
- This tool should only be used to download content you own or have explicit permission to download

**The developer disclaims all liability for any illegal, unauthorized, or inappropriate use of this software. Users assume full responsibility for their actions and compliance with applicable laws and terms of service.**

---

### Created by Simeon Tsvetanov
