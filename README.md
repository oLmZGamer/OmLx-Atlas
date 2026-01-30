# 🌌 OmLx Atlas

<p align="center">
  <img src="atlascardprev.png" alt="OmLx Atlas Logo" width="200"/>
</p>

<p align="center">
  <strong>A high-performance, unified game library with a cinematic, console-style interface.</strong><br>
  OmLx Atlas brings all your games from various launchers into one beautiful, organized space.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.2-blue?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge&logo=windows" alt="Platform"/>
  <img src="https://img.shields.io/badge/Electron-34.0.0-47848F?style=for-the-badge&logo=electron" alt="Electron"/>
</p>

---

## ✨ Program Features

OmLx Atlas is packed with features designed to give you the ultimate gaming experience:

### 🧩 Launcher Integration
- **Universal Detection**: Automatically find and import games from **Steam**, **Epic Games**, **Xbox / Game Pass**, **EA App**, **Ubisoft Connect**, and **GOG Galaxy**. 
- **(Beta) Universal App Detection**: Enable experimental detection for non-gaming apps like Spotify, Discord, and creative software.
- **Manual Additions**: Easily add any `.exe` or application shortcut that isn't automatically detected.
- **Custom Folder Scanning**: Point the app to specific directories to scan for portable games or standalone apps.

### 🎨 Premium Cinematic UI
- **Dynamic Backgrounds**: The interface reacts to your selection, displaying game-specific artwork and covers.
- **Micro-Animations**: Smooth, high-refresh-rate transitions and hover effects for a premium feel.
- **Grid Customization**: Switch between Medium and Large grid sizes to suit your display and preference.
- **Theme System**: Choose from multiple curated themes including **Violet (Default)**, **Emerald**, **Amber**, **Crimson**, **Azure**, and **Midnight**.
- **Custom Wallpapers**: Upload your own background images to personalize the dashboard.

### 📊 Game Tracking & Statistics
- **Playtime Tracking**: Automatically monitors how long you spend in each game.
- **Last Played**: Keeps track of your most recent gaming sessions.
- **Recently Played Section**: Quick access to your most recent games on the main dashboard.
- **Statistics Dashboard**: A dedicated statistics page showing your gaming habits, total playtime, and activity overview.
- **Per-Game Statistics**: View detailed stats for each game including total hours played and session history.

### 🗂️ Categories & Organization
- **Custom Categories**: Create your own categories to organize games your way.
- **Category Filters**: Quickly filter your library by category from the sidebar.
- **Auto-Assignment**: Games can be automatically assigned to categories upon discovery.
- **Multi-Select Mode**: Select multiple games at once to perform batch actions like moving to categories.

### 🛠️ Advanced Management
- **Artwork Search**: Automatically find and apply high-quality game covers and background art from online sources.
- **Favorites System**: Quick-access section for your most-played games.
- **Fuzzy Search**: Find any game instantly with a smart, lightning-fast search bar.
- **Launcher Assignment**: Manually change or correct the launcher category for any game in your library.
- **Folder Quick-Open**: Jump directly to a game's installation folder with one click.
- **Active Folder Display**: View and manage currently active scan folders.

### ⌨️ Navigation & Controls
- **Keyboard Shortcuts**: Fully navigable via keyboard (Arrows for grid, `Ctrl+F` for search, etc.).
- **Window Controls**: Support for Fullscreen, Minimize, and customizable window states.
- **Sound Effects**: Immersive audio feedback for navigation, clicking, and launching games.

---

## 🚀 Getting Started

### Prerequisites
- Windows 10/11
- Node.js (v18 or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/oLmZGamer/OmLx-Atlas.git
   cd OmLx-Atlas
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the application:
   ```bash
   npm start
   ```

### Building for Distribution
```bash
npm run dist
```
This will create a portable Windows executable in the `dist` folder.

---

## 📝 Notes

- **AI was used in this project** to assist with development.
- **Game Detection** might detect `.exe` files that are not actually games.
- **Statistics tracking** begins from when you first launch a game through OmLx Atlas.

---

## 📜 License & Usage Rights

This software is provided under a custom permission structure. By using or modifying this code, you agree to the following terms:

### ✅ What You ARE Allowed To Do:
1. **Personal Use**: You are free to use this application for your own personal gaming setup.
2. **Learning & Education**: You can study the code to learn how launcher detection, Electron integration, and the UI systems work.
3. **Local Modification**: You can modify the code on your own machine to better suit your personal needs.
4. **Private Forking**: You can fork the project for private use.

### ❌ What You ARE NOT Allowed To Do:
1. **Commercial Redistribution**: You may not sell this software or any part of its code for profit.
2. **Plagiarism**: You may not claim this code as your own original work without giving proper credit to the original author.
3. **Public Distribution of Modified Versions**: You may not publicly distribute modified versions of OmLx Atlas as a separate product without explicit permission.

### ⚖️ Disclaimer
*THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.*

---

## 🤝 Contributing

While this is primarily a personal project, suggestions and feedback are welcome! Feel free to open an issue for bug reports or feature requests.

---

<p align="center">
  <strong>Created with ❤️ for gamers by OmLx Studios</strong>
</p>
