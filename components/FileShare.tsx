'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import Navbar from './Navbar';
import { QRCodeCanvas } from 'qrcode.react';
import { useSearchParams } from 'next/navigation';

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const CHUNK_SIZE = 262144; // Increase to 256KB chunks
  const SPEED_UPDATE_INTERVAL = 500; // Update speed every 500ms
  const SPEED_HISTORY_LENGTH = 5; // Number of samples to average
  const lastSpeedUpdate = useRef<{ [key: string]: number }>({});
  const speedHistory = useRef<{ [key: string]: SpeedHistory[] }>({});
  const autoSendRef = useRef(false);

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
      autoSendRef.current = false;
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
      autoSendRef.current = false;
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

  const sendFiles = useCallback(async () => {
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
  }, [conn, files, isTransferring]);

  useEffect(() => {
    const hasPending = files.some(file => file.status === 'pending');
    if (isConnected && hasPending && !isTransferring && !autoSendRef.current) {
      autoSendRef.current = true;
      sendFiles();
    }
  }, [isConnected, files, isTransferring, sendFiles]);

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

  const FileProgressBar = ({ file, index }: { file: FileTransfer, index: number }) => {
    const isError = file.status === 'error';
    const isDone = file.status === 'completed';
    const isPending = file.status === 'pending';
    const progressValue = isPending ? 0 : file.progress;
    const barColor = isError
      ? 'bg-red-500'
      : isDone
        ? 'bg-emerald-500'
        : isPending
          ? 'bg-white/20'
          : 'bg-primary';

    return (
      <div key={index} className="glass rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{file.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {isPending && 'Ready to send'}
              {file.status === 'transferring' && 'Transferring'}
              {isDone && 'Completed'}
              {isError && 'Transfer interrupted'}
            </p>
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            {isPending ? '0%' : isDone ? '100%' : `${file.progress}%`}
            {file.speed && file.status === 'transferring' && (
              <span className="ml-2">{formatSpeed(file.speed)}</span>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>
    );
  };

  const showStatus = Boolean(peer || searchParams.get('share') || isConnected);
  const statusTone = isConnected
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    : status.includes('Waiting')
      ? 'border-amber-300/30 bg-amber-300/10 text-amber-200'
      : 'border-primary/30 bg-primary/10 text-primary';
  const statusLabel = isConnected ? 'Connected to peer' : status || 'Starting secure session...';

  return (
    <div className="app-shell min-h-screen text-foreground">
      <Navbar />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-6 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-float" />
        <div className="pointer-events-none absolute top-24 -left-28 h-80 w-80 rounded-full bg-slate-400/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
        <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-12 lg:pt-16">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-muted-foreground animate-fade-in-up">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse-soft" />
                Private P2P Transfer
              </div>
              <div className="space-y-4 animate-fade-in-up delay-150">
                <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                  Elegant file sharing without any limits
                </h1>
                <p className="text-lg text-muted-foreground">
                  WarpShare connects browsers directly, so your files move fast, stay private, and never touch a server.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 animate-fade-in-up delay-300">
                <div className="glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-foreground">No size limits</p>
                  <p className="mt-1 text-xs text-muted-foreground">Send massive files with zero storage caps.</p>
                </div>
                <div className="glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-foreground">Instant pairing</p>
                  <p className="mt-1 text-xs text-muted-foreground">One link, one scan, and you are connected.</p>
                </div>
                <div className="glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-foreground">Private by design</p>
                  <p className="mt-1 text-xs text-muted-foreground">No uploads, no accounts, no tracking.</p>
                </div>
              </div>

              <div className="glass-strong shine rounded-3xl p-6 animate-fade-in-up delay-500">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      Built for focus
                    </p>
                    <p className="mt-2 text-base text-foreground">
                      Fast, quiet, and respectful of your bandwidth. Transfers stay in the browser, and you control the session.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-primary/90">
                    <img
                      src="https://webrtc.github.io/webrtc-org/assets/images/webrtc-logo-vert-retro-dist.svg"
                      alt="WebRTC"
                      className="h-8 w-auto opacity-90"
                      loading="lazy"
                    />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                      WebRTC + end-to-end transport
                    </span>
                  </div>
                </div>
              </div>

            </section>

            <section className="space-y-6">
              {showStatus && (
                <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] ${statusTone} animate-fade-in-up`}>
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {statusLabel}
                </div>
              )}

              <div className="glass-strong rounded-3xl p-6 animate-fade-in-up delay-150">
                {!peer && !searchParams.get('share') && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Start here</p>
                      <h2 className="mt-2 text-2xl font-semibold text-foreground">Create a private session</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add the files you want to send, then generate a share link for the recipient.
                      </p>
                    </div>

                    <div
                      className="rounded-3xl border-2 border-dashed border-white/20 bg-white/5 p-8 text-center transition hover:border-primary/60"
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
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        multiple
                      />
                      <svg className="mx-auto h-12 w-12 text-muted-foreground" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-3 text-sm font-medium text-foreground">Drop files here or click to select</p>
                      <p className="mt-1 text-xs text-muted-foreground">Any file type, any size, peer to peer.</p>
                    </div>

                    {files.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Selected files</h3>
                        <div className="space-y-3">
                          {files.map((file, index) => (
                            <FileProgressBar key={index} file={file} index={index} />
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={startPeer}
                      className="shine w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_-16px_rgba(0,0,0,0.7)] transition hover:bg-primary/90"
                    >
                      Generate Share Link
                    </button>
                  </div>
                )}

                {(peer || searchParams.get('share')) && !isConnected && !showQR && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Connecting</p>
                      <h2 className="mt-2 text-2xl font-semibold text-foreground">Starting secure session</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Generating the share link. This should take just a moment.
                      </p>
                    </div>
                    <div className="glass rounded-3xl p-8 flex flex-col items-center justify-center gap-4 text-center">
                      <div className="h-12 w-12 rounded-full border-2 border-dashed border-primary/70 border-t-transparent animate-spin" />
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        Waiting for link
                      </p>
                    </div>
                  </div>
                )}

                {(peer || searchParams.get('share')) && !isConnected && showQR && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Share</p>
                      <h2 className="mt-2 text-2xl font-semibold text-foreground">Invite your recipient</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Send this link or QR code. Once they connect, your private session goes live.
                      </p>
                    </div>
                    <div className="glass rounded-3xl p-6">
                      <div className="flex flex-col items-center gap-6">
                        <div className="rounded-2xl border border-white/10 bg-white p-4">
                          <QRCodeCanvas
                            value={shareUrl}
                            size={200}
                            className="rounded-lg"
                            style={{ display: 'block' }}
                          />
                        </div>
                        <div className="flex w-full flex-col gap-3 sm:flex-row">
                          <input
                            type="text"
                            readOnly
                            value={shareUrl}
                            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-foreground"
                          />
                          <button
                            onClick={() => navigator.clipboard.writeText(shareUrl)}
                            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-white/20"
                          >
                            Copy Link
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isConnected && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Live session</p>
                      <h2 className="mt-2 text-2xl font-semibold text-foreground">Transfer files</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Drag files into the drop zone or browse to send them instantly.
                      </p>
                    </div>

                    <div
                      className="rounded-3xl border-2 border-dashed border-white/20 bg-white/5 p-8 text-center transition hover:border-primary/60"
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
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        multiple
                      />
                      <svg className="mx-auto h-12 w-12 text-muted-foreground" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-3 text-sm font-medium text-foreground">Drop files here or click to select</p>
                      <p className="mt-1 text-xs text-muted-foreground">Your files never touch a server.</p>
                    </div>

                    {files.length > 0 && (
                      <div className="space-y-4">
                        <button
                          onClick={sendFiles}
                          disabled={isTransferring}
                          className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-[0_12px_30px_-16px_rgba(0,0,0,0.7)] transition ${
                            isTransferring
                              ? 'bg-white/10 text-muted-foreground'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90'
                          }`}
                        >
                          {isTransferring ? 'Sending...' : 'Send Files'}
                        </button>

                        <div className="space-y-3">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Sending</h3>
                          {files.map((file, index) => (
                            <FileProgressBar key={index} file={file} index={index} />
                          ))}
                        </div>
                      </div>
                    )}

                    {receivingFiles.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Receiving</h3>
                        {receivingFiles.map((file, index) => (
                          <FileProgressBar key={index} file={file} index={index} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="glass rounded-2xl px-4 py-3 text-xs text-muted-foreground">
                  No uploads. Direct transfer.
                </div>
                <div className="glass rounded-2xl px-4 py-3 text-xs text-muted-foreground">
                  Open source, auditable.
                </div>
                <div className="glass rounded-2xl px-4 py-3 text-xs text-muted-foreground">
                  Works on any device.
                </div>
              </div>

              <div className="glass rounded-2xl px-5 py-4 text-xs text-muted-foreground">
                Tip: Keep this tab open while the transfer runs. Closing it ends the connection.
              </div>
            </section>
          </div>

          <div id="about" className="mt-20 rounded-3xl border border-white/10 bg-white/5 p-10 shadow-[0_24px_70px_-55px_rgba(0,0,0,0.8)] backdrop-blur">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">Why WarpShare</p>
                <h2 className="mt-3 text-3xl font-semibold text-foreground">Private file sharing that feels effortless.</h2>
                <p className="mt-4 text-base text-muted-foreground">
                  WarpShare uses WebRTC to connect peers directly. No file storage, no accounts, no waiting rooms. Just a secure link and a seamless exchange.
                </p>
              </div>
              <div className="space-y-4">
                <div className="glass rounded-2xl p-5">
                  <p className="text-sm font-semibold text-foreground">How it works</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Share a link, scan the code, and transfer. The connection happens entirely in the browser.
                  </p>
                </div>
                <div className="glass rounded-2xl p-5">
                  <p className="text-sm font-semibold text-foreground">Security</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Files move directly between peers, never landing on a server. You stay in control from start to finish.
                  </p>
                </div>
                <div className="glass rounded-2xl p-5">
                  <p className="text-sm font-semibold text-foreground">Momentum</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Designed for speed and clarity with calm, dark UI and subtle glass layering.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <footer className="border-t border-white/10 bg-background/80 py-8 text-center text-xs text-muted-foreground">
        <p>&copy; Copyright Md Afridi 2024</p>
      </footer>
    </div>
  );
};

export default FileShare;
