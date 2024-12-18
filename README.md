# P2P File Share

A **Peer-to-Peer (P2P) File Sharing** application built with React and PeerJS, allowing users to share files directly between browsers without the need for intermediary servers.

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Features

- **Direct P2P File Transfer**: Share files directly between users without server storage.
- **WebRTC Technology**: Utilizes WebRTC for establishing secure peer connections.
- **User-Friendly Interface**: Simple and intuitive design with real-time status updates.
- **Privacy and Security**: Files are not stored on any server, enhancing privacy.
- **Cross-Platform**: Works on any modern browser supporting WebRTC.

## How It Works

This application uses **WebRTC** technology via **PeerJS** to establish a direct connection between two peers. Each user generates a unique Peer ID by starting a peer. Users can connect by sharing these IDs. Once connected, they can send and receive files directly through their browsers.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (Version 12 or above)
- [npm](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/hackerslash/p2p-share.git
   cd p2p-file-share
   ```
2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   ```
3. **Run the application**

   ```bash
   npm run dev
   # or
   yarn dev
   ```
4. **Open your browser**

   Navigate to `http://localhost:3000` to view the application.

## Usage

1. **Start Peer**

   - Click on the **"Start Peer"** button.
   - Your unique **Peer ID** will be displayed.
2. **Share Your Peer ID**

   - Copy your Peer ID by clicking on **"Copy ID"**.
   - Share this ID with the person you want to connect with.
3. **Connect to a Peer**

   - Enter the **Peer ID** of the other user in the **"Enter ID to connect"** field.
   - Click on **"Connect"** to establish a connection.
4. **File Sharing**

   - Once connected, click on **"Select a file"** to choose a file from your device.
   - The selected file will be displayed.
   - Click on **"Send File"** to start the file transfer.
5. **Receiving Files**

   - When a file is sent to you, you will receive a prompt to download it.
   - The file will be downloaded directly to your device.

## Dependencies

- **React** - Front-end library for building the user interface.
- **PeerJS** - Simplifies WebRTC peer-to-peer data connections.
- **TypeScript** - Adds type safety to JavaScript.
- **Next.js** - React framework for server-side rendering.
- **Tailwind CSS** - Utility-first CSS framework for styling.

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the Repository**

   Click on the **Fork** button at the top right of the page.
2. **Create Your Feature Branch**

   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit Your Changes**

   ```bash
   git commit -m 'Add some amazing feature'
   ```
4. **Push to the Branch**

   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open a Pull Request**

   Go to your forked repository and click on the **Pull Request** button.

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- **[PeerJS](https://peerjs.com/)**: For simplifying the WebRTC connections.
- **[React](https://reactjs.org/)**: For the powerful front-end library.
- **[Next.js](https://nextjs.org/)**: For server-side rendering capabilities.
- **[Tailwind CSS](https://tailwindcss.com/)**: For the utility-first CSS framework.
- **[WebRTC](https://webrtc.org/)**: For enabling real-time communication.

---

*Made with ❤️ by Md Afridi Sk.*

[![GitHub followers](https://img.shields.io/github/followers/hackerslash.svg?style=social&label=Follow)](https://github.com/hackerslash)

# Contact

For any inquiries or feedback, please contact me at [afridijnv19@gmail.com](mailto:afridijnv19@gmail.com).

---

