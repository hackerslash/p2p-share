'use client'

import React, { useState, useRef, useEffect } from 'react';
import Peer, { DataConnection } from 'peerjs';
import Navbar from './Navbar';
import {QRCodeCanvas} from 'qrcode.react';
import { useSearchParams, useRouter } from 'next/navigation';

interface FileTransfer {
  file: File;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  speed?: number; // in bytes per second
  isReceiving?: boolean;
}

interface SpeedHistory {
  time: number;
  loaded: number;
  speed: number;
}

const FileShare: React.FC = () => {
  const [peerId, setPeerId] = useState<string>('');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connectId, setConnectId] = useState<string>('');
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [files, setFiles] = useState<FileTransfer[]>([]);
  const [receivingFiles, setReceivingFiles] = useState<FileTransfer[]>([]);
  const [status, setStatus] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const lastProgressUpdate = useRef<{ [key: string]: { time: number; loaded: number } }>({});
  const [shareUrl, setShareUrl] = useState<string>('');
  const [showQR, setShowQR] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const CHUNK_SIZE = 262144; // Increase to 256KB chunks
  const SPEED_UPDATE_INTERVAL = 500; // Update speed every 500ms
  const SPEED_HISTORY_LENGTH = 5; // Number of samples to average
  const lastSpeedUpdate = useRef<{ [key: string]: number }>({});
  const speedHistory = useRef<{ [key: string]: SpeedHistory[] }>({});

  useEffect(() => {
    return () => {
      if (peer) {
        peer.destroy();
      }
    };
  }, [peer]);

  useEffect(() => {
    const shareId = searchParams.get('share');
    if (shareId) {
      // Start peer and then connect
      const newPeer = new Peer();
      setPeer(newPeer);
      
      newPeer.on('open', async () => {
        setPeerId(newPeer.id);
        setStatus('Peer started. Connecting...');
        
        // Fetch peer ID and connect automatically
        const response = await fetch(`/api/share?id=${shareId}`);
        const data = await response.json();
        
        if (data.peerId) {
          setConnectId(data.peerId);
          const connection = newPeer.connect(data.peerId);
          setupConnection(connection);
        }
      });

      newPeer.on('connection', (connection) => {
        setStatus('Incoming connection...');
        setupConnection(connection);
      });

      return () => {
        newPeer.destroy();
      };
    }
  }, [searchParams]);

  const startPeer = () => {
    const newPeer = new Peer();
    newPeer.on('open', async (id) => {
      setPeerId(id);
      setStatus('Peer started. Waiting for connection...');
      
      // Generate share URL
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: id })
      });
      const { shareId } = await response.json();
      const url = `${window.location.origin}?share=${shareId}`;
      setShareUrl(url);
      setShowQR(true);
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

  const setupConnection = (connection: DataConnection) => {
    connection.on('open', () => {
      setStatus('Connected');
      setIsConnected(true);
      setConn(connection);
    });

    let receivingFile: {
      data: ArrayBuffer[];
      name: string;
      type: string;
      totalChunks: number;
      receivedChunks: number;
    } | null = null;

    connection.on('data', (data: any) => {
      if (data.type === 'chunk') {
        if (!receivingFile) {
          receivingFile = {
            data: new Array(data.totalChunks),
            name: data.fileName,
            type: data.fileType,
            totalChunks: data.totalChunks,
            receivedChunks: 0
          };
          setReceivingFiles(prev => [...prev, {
            file: new File([], data.fileName, { type: data.fileType }),
            progress: 0,
            status: 'transferring',
            isReceiving: true
          }]);
        }

        receivingFile.data[data.chunkIndex] = data.chunk;
        receivingFile.receivedChunks++;

        const progress = Math.round((receivingFile.receivedChunks / data.totalChunks) * 100);
        
        setReceivingFiles(prev => prev.map(f => 
          f.file.name === data.fileName 
            ? { ...f, progress, status: 'transferring' } 
            : f
        ));

        if (receivingFile.receivedChunks === receivingFile.totalChunks) {
          const allChunksReceived = receivingFile.data.every(chunk => chunk !== undefined);
          
          if (allChunksReceived) {
            const fileBlob = new Blob(receivingFile.data, { type: receivingFile.type });
            downloadFile(fileBlob, receivingFile.name, receivingFile.type);
            setReceivingFiles(prev => prev.map(f => 
              f.file.name === data.fileName 
                ? { ...f, progress: 100, status: 'completed' } 
                : f
            ));
          } else {
            setReceivingFiles(prev => prev.map(f => 
              f.file.name === data.fileName 
                ? { ...f, status: 'error' } 
                : f
            ));
          }
          receivingFile = null;
        }
      }
    });

    connection.on('close', () => {
      setStatus('Connection closed');
      setIsConnected(false);
      setConn(null);
      setFiles([]);
    });
  };

  const sendFileInChunks = async (fileTransfer: FileTransfer, index: number) => {
    if (!conn) return;
    
    const file = fileTransfer.file;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const CONCURRENT_CHUNKS = 3; // Reduced from 5 to 3 for better reliability
    const MAX_RETRIES = 3;
    
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'transferring' } : f
    ));

    const sendChunk = async (chunkIndex: number, retryCount = 0): Promise<boolean> => {
      try {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const buffer = await chunk.arrayBuffer();
        
        conn.send({
          type: 'chunk',
          fileId: index,
          fileName: file.name,
          fileType: file.type,
          chunk: buffer,
          chunkIndex: chunkIndex,
          totalChunks,
        });
        
        return true;
      } catch (error) {
        if (retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          return sendChunk(chunkIndex, retryCount + 1);
        }
        return false;
      }
    };

    for (let i = 0; i < totalChunks; i += CONCURRENT_CHUNKS) {
      const chunkPromises = [];
      
      for (let j = 0; j < CONCURRENT_CHUNKS && (i + j) < totalChunks; j++) {
        chunkPromises.push(sendChunk(i + j));
      }
      
      const results = await Promise.all(chunkPromises);
      
      if (results.includes(false)) {
        setFiles(prev => prev.map((f, idx) => 
          idx === index ? { ...f, status: 'error' } : f
        ));
        return;
      }
      
      const progress = Math.round(((i + CONCURRENT_CHUNKS) / totalChunks) * 100);
      setFiles(prev => prev.map((f, idx) => 
        idx === index ? { ...f, progress: Math.min(progress, 100) } : f
      ));
    }

    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'completed' } : f
    ));
  };

  const sendFiles = async () => {
    if (!conn || files.length === 0 || isTransferring) return;
    
    setIsTransferring(true);
    setStatus('Sending files...');

    for (let i = 0; i < files.length; i++) {
      const fileTransfer = files[i];
      if (fileTransfer.status === 'pending') {
        await sendFileInChunks(fileTransfer, i);
      }
    }

    setStatus('All files sent');
    setIsTransferring(false);
  };

  const downloadFile = (fileData: Blob | ArrayBuffer, fileName: string, fileType: string) => {
    const blob = fileData instanceof Blob ? fileData : new Blob([fileData], { type: fileType });
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
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        progress: 0,
        status: 'pending' as const,
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const updateTransferSpeed = (fileId: string, loaded: number, isReceiving: boolean) => {
    const now = Date.now();
    const last = lastProgressUpdate.current[fileId];
    const lastUpdate = lastSpeedUpdate.current[fileId] || 0;
    
    // Initialize speed history for this file if it doesn't exist
    if (!speedHistory.current[fileId]) {
      speedHistory.current[fileId] = [];
    }

    // Only update speed if enough time has passed since last update
    if (now - lastUpdate >= SPEED_UPDATE_INTERVAL) {
      if (last) {
        const timeDiff = (now - last.time) / 1000; // convert to seconds
        const bytesDiff = Math.max(0, loaded - last.loaded); // Ensure non-negative
        const currentSpeed = bytesDiff / timeDiff; // bytes per second

        // Add to speed history
        speedHistory.current[fileId].push({
          time: now,
          loaded,
          speed: currentSpeed
        });

        // Keep only the last N samples
        if (speedHistory.current[fileId].length > SPEED_HISTORY_LENGTH) {
          speedHistory.current[fileId].shift();
        }

        // Calculate average speed from history
        const avgSpeed = speedHistory.current[fileId].reduce((sum, item) => sum + item.speed, 0) / 
                        speedHistory.current[fileId].length;

        // Only update if we have a reasonable speed value
        if (avgSpeed >= 0 && avgSpeed < 1e9) { // Max 1GB/s as sanity check
          if (isReceiving) {
            setReceivingFiles(prev => prev.map(f => 
              f.file.name === fileId ? { ...f, speed: avgSpeed } : f
            ));
          } else {
            setFiles(prev => prev.map((f, idx) => 
              idx === parseInt(fileId) ? { ...f, speed: avgSpeed } : f
            ));
          }
        }
      }
      lastSpeedUpdate.current[fileId] = now;
    }

    lastProgressUpdate.current[fileId] = { time: now, loaded };
  };

  // Clean up function to prevent memory leaks
  const cleanupSpeedHistory = (fileId: string) => {
    delete speedHistory.current[fileId];
    delete lastSpeedUpdate.current[fileId];
    delete lastProgressUpdate.current[fileId];
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return '';
    if (speed < 1024) return `${speed.toFixed(1)} B/s`;
    if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`;
    return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const FileProgressBar = ({ file, index }: { file: FileTransfer, index: number }) => (
    <div key={index} className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-500">{file.file.name}</span>
        <div className="text-sm text-gray-500">
          {file.status === 'pending' ? (
            <span>Ready to send</span>
          ) : (
            <>
              <span>{file.status === 'completed' ? '100%' : `${file.progress}%`}</span>
              {file.speed && file.status === 'transferring' && (
                <span className="ml-2">({formatSpeed(file.speed)})</span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${
            file.status === 'completed' 
              ? 'bg-green-500' 
              : file.status === 'error'
              ? 'bg-red-500'
              : file.status === 'pending'
              ? 'bg-gray-400'
              : 'bg-indigo-600'
          }`}
          style={{ width: `${file.status === 'pending' ? '0%' : `${file.progress}%`}` }}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      {/* Single Status Indicator */}
      {(peer || searchParams.get('share') || isConnected) && (
        <div className={`py-2 ${isConnected ? 'bg-green-50' : 'bg-blue-50'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center space-x-2">
              <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${
                isConnected 
                  ? 'bg-green-500'
                  : status.includes('Waiting') 
                    ? 'bg-orange-500' 
                    : 'bg-blue-500'
              }`}></div>
              <span className={`text-sm font-medium ${
                isConnected
                  ? 'text-green-700'
                  : status.includes('Waiting')
                    ? 'text-orange-700'
                    : 'text-blue-700'
              }`}>
                {isConnected ? 'Peer Connected' : status}
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Initial state - only show when not connected and not connecting via share link */}
          {!peer && !searchParams.get('share') && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) {
                    const newFiles = Array.from(e.dataTransfer.files).map(file => ({
                      file,
                      progress: 0,
                      status: 'pending' as const,
                    }));
                    setFiles(prev => [...prev, ...newFiles]);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  multiple
                />
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="mt-2 text-sm text-gray-600">Drop files here or click to select</p>
                <p className="mt-1 text-xs text-gray-500">Supports any file type</p>
              </div>

              {/* Show pending files before starting peer */}
              {files.length > 0 && (
                <div className="space-y-4">
                  <div className="mt-4">
                    <h3 className="text-lg font-medium mb-4">Selected Files</h3>
                    <div className="space-y-4">
                      {files.map((file, index) => (
                        <FileProgressBar key={index} file={file} index={index} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={startPeer}
                className="w-full py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Send Files
              </button>
            </div>
          )}

          {/* Connecting status - show when peer is starting or connecting via share link */}
          {(peer || searchParams.get('share')) && !isConnected && (
            showQR && (
              <div className="space-y-6 bg-card p-8 rounded-lg border border-border shadow-sm">
                <div className="text-center space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">Share this link with recipient</h3>
                  <div className="flex justify-center">
                    <div className="p-4 bg-white rounded-lg border border-border">
                      <QRCodeCanvas 
                        value={shareUrl} 
                        size={200}
                        className="rounded-lg"
                        style={{ display: 'block' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(shareUrl)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Connected UI - show for both sender and receiver when connected */}
          {isConnected && (
            <div className="space-y-6">
              <div className="space-y-4">
                {/* File Drop Zone */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    multiple
                  />
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">Drop files here or click to select</p>
                </div>

                {/* File Transfer Progress */}
                {files.length > 0 && (
                  <div className="space-y-4">
                    <button
                      onClick={sendFiles}
                      disabled={isTransferring}
                      className={`w-full py-3 px-4 rounded-lg transition-colors ${
                        isTransferring 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                    >
                      {isTransferring ? 'Sending...' : 'Send Files'}
                    </button>

                    {/* Sending Files Section */}
                    <div className="mt-8 border-t border-gray-200 pt-6">
                      <h3 className="text-lg font-medium mb-4">Sending Files</h3>
                      <div className="space-y-4">
                        {files.map((file, index) => (
                          <FileProgressBar key={index} file={file} index={index} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Receiving Files Section */}
                {receivingFiles.length > 0 && (
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-medium mb-4">Receiving Files</h3>
                    <div className="space-y-4">
                      {receivingFiles.map((file, index) => (
                        <FileProgressBar key={index} file={file} index={index} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* About Section */}
      <div id="about" className="bg-secondary/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">About</h2>
            <p className="mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
              Why P2P File Sharing?
            </p>
            <p className="mt-4 max-w-2xl text-xl text-muted-foreground lg:mx-auto">
              P2P File Sharing allows for direct, secure, and efficient file transfers between users without the need for intermediary servers.
            </p>
          </div>
          <div className="mt-12">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
              <div className="relative bg-card p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-primary-foreground">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg font-semibold text-foreground">How it works</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-muted-foreground">
                  Our P2P File Sharing uses WebRTC technology to establish a direct connection between peers. Files are transferred directly between users' browsers, ensuring speed and privacy.
                </dd>
              </div>
              <div className="relative bg-card p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-primary-foreground">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg font-semibold text-foreground">Security</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-muted-foreground">
                  The peer-to-peer nature of the connection ensures that your files are transferred directly, without being stored on any intermediate servers, enhancing privacy and security.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <footer className="bg-background border-t border-border py-8 text-center">
        <p className="text-sm text-muted-foreground">&copy; Copyright Md Afridi 2024</p>
      </footer>
    </div>
  );
};

export default FileShare;

