'use client'

import React, { useState, useRef, useEffect } from 'react';
import Peer from 'peerjs';
import Navbar from './Navbar';

const FileShare: React.FC = () => {
  const [peerId, setPeerId] = useState<string>('');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connectId, setConnectId] = useState<string>('');
  const [conn, setConn] = useState<Peer.DataConnection | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (peer) {
        peer.destroy();
      }
    };
  }, [peer]);

  const startPeer = () => {
    const newPeer = new Peer();
    newPeer.on('open', (id) => {
      setPeerId(id);
      setStatus('Peer started. Waiting for connection...');
    });
    newPeer.on('connection', (connection) => {
      setStatus('Incoming connection...');
      setupConnection(connection);
    });
    setPeer(newPeer);
  };

  const connectToPeer = () => {
    if (peer && connectId) {
      setStatus('Connecting...');
      const connection = peer.connect(connectId);
      setupConnection(connection);
    }
  };

  const setupConnection = (connection: Peer.DataConnection) => {
    connection.on('open', () => {
      setStatus('Connected');
      setIsConnected(true);
      setConn(connection);
    });
    connection.on('data', (data: any) => {
      setStatus('Receiving file...');
      downloadFile(data.fileData, data.fileName, data.fileType);
      setStatus('File received');
    });
    connection.on('close', () => {
      setStatus('Connection closed');
      setIsConnected(false);
      setConn(null);
    });
  };

  const sendFile = () => {
    if (conn && file) {
      setStatus('Sending file...');
      const reader = new FileReader();
      reader.onload = () => {
        const fileData = reader.result;
        const fileName = file.name;
        const fileType = file.type;
        conn.send({ fileData, fileName, fileType });
        setStatus('File sent');
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const downloadFile = (fileData: ArrayBuffer, fileName: string, fileType: string) => {
    const blob = new Blob([fileData], { type: fileType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Navbar />
      <div className="flex-grow py-6 flex flex-col justify-center sm:py-12">
        <div className="relative py-3 sm:max-w-xl sm:mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-light-blue-500 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"></div>
          <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
            <div className="max-w-md mx-auto">
              <div className="divide-y divide-gray-200">
                <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                  <h2 className="text-3xl font-extrabold text-gray-900">P2P File Share</h2>
                  <p className="text-gray-500">{status}</p>
                  {!peer && (
                    <button
                      onClick={startPeer}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Start Peer
                    </button>
                  )}
                  {peerId && (
                    <div className="mt-1 flex rounded-md shadow-sm">
                      <input
                        type="text"
                        readOnly
                        value={peerId}
                        className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md focus:ring-indigo-500 focus:border-indigo-500 text-sm border-gray-300"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(peerId)}
                        className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm"
                      >
                        Copy ID
                      </button>
                    </div>
                  )}
                  {peer && !isConnected && (
                    <div className="mt-1 flex rounded-md shadow-sm">
                      <input
                        type="text"
                        placeholder="Enter ID to connect"
                        value={connectId}
                        onChange={(e) => setConnectId(e.target.value)}
                        className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md focus:ring-indigo-500 focus:border-indigo-500 text-sm border-gray-300"
                      />
                      <button
                        onClick={connectToPeer}
                        className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-indigo-600 text-white text-sm hover:bg-indigo-700"
                      >
                        Connect
                      </button>
                    </div>
                  )}
                  {isConnected && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center bg-grey-lighter">
                        <label className="w-64 flex flex-col items-center px-4 py-6 bg-white text-indigo-600 rounded-lg shadow-lg tracking-wide uppercase border border-indigo-600 cursor-pointer hover:bg-indigo-600 hover:text-white">
                          <svg className="w-8 h-8" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M16.88 9.1A4 4 0 0 1 16 17H5a5 5 0 0 1-1-9.9V7a3 3 0 0 1 4.52-2.59A4.98 4.98 0 0 1 17 8c0 .38-.04.74-.12 1.1zM11 11h3l-4-4-4 4h3v3h2v-3z" />
                          </svg>
                          <span className="mt-2 text-base leading-normal">Select a file</span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                          />
                        </label>
                      </div>
                      {file && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500">Selected file: {file.name}</p>
                          <button
                            onClick={sendFile}
                            className="mt-2 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Send File
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="about" className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-indigo-600 font-semibold tracking-wide uppercase">About</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Why P2P File Sharing?
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              P2P File Sharing allows for direct, secure, and efficient file transfers between users without the need for intermediary servers.
            </p>
          </div>
          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">How it works</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Our P2P File Sharing uses WebRTC technology to establish a direct connection between peers. Files are transferred directly between users' browsers, ensuring speed and privacy.
                </dd>
              </div>
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Security</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  The peer-to-peer nature of the connection ensures that your files are transferred directly, without being stored on any intermediate servers, enhancing privacy and security.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <footer className="bg-gray-800 text-white text-center p-4">
        <p>&copy; Copyright Md Afridi 2024</p>
      </footer>
    </div>
  );
};

export default FileShare;

