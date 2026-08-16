import { useState, useEffect, useRef } from 'react'
import { Wifi, Phone, CheckCircle, XCircle, Signal, Bluetooth, Location, Clock, Loader2, Keyboard, Mouse, Monitor, Folder, Menu, AlertCircle, Check as CheckIcon } from 'lucide-react'

/**
 * DevicesPanel — Multi-Phone Status & Controls.
 *
 * Shows connected Android devices over ADB Wi-Fi with IP status indicators.
 * Provides pairing (QR code / IP), command execution, screen lock/unlock,
 * and OS automation controls (Notepad, WhatsApp, Downloads organizer).
 * Dispatches `calamox-device-updated` events with device status.
 */
export default function DevicesPanel({ className = '' }) {
  const [devices, setDevices] = useState([])
  const [pairingMode, setPairingMode] = useState<'none' | 'qr' | 'ip'>('none')
  const [pairingInput, setPairingInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const containerRef = useRef(null)

  // Fetch devices from backend
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await fetch('/api/agents')
        const data = await res.json()
        setDevices(data.agents || [])
      } catch (err) {
        console.error('Failed to fetch devices:', err)
      }
    }
    fetchDevices()
    const interval = setInterval(fetchDevices, 10000)
    return () => clearInterval(interval)
  }, [])

  const togglePairing = (mode: 'qr' | 'ip') => {
    setPairingMode(mode)
    setPairingInput('')
    setConnecting(true)
  }

  const cancelPairing = () => {
    setPairingMode('none')
    setConnecting(false)
  }

  const connectDevice = async (ip: string) => {
    setConnecting(true)
    try {
      const res = await fetch('/api/adb/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, token: 'calamox-default' })
      })
      const data = await res.json()
      if (data.success) {
        // Refresh device list
        const res2 = await fetch('/api/agents')
        const data2 = await res2.json()
        setDevices(data2.agents || [])
      }
      setConnecting(false)
      setPairingMode('none')
    } catch (err) {
      console.error('Pairing failed:', err)
      setConnecting(false)
    }
  }

  const sendCommand = async (device: any, command: string) => {
    if (!device.ip) return
    setConnecting(true)
    try {
      const res = await fetch('/api/adb/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, command })
      })
      const data = await res.json()
      if (!data.success) {
        console.error('Command failed:', data.error)
      }
    } catch (err) {
      console.error('Command error:', err)
    } finally {
      setConnecting(false)
    }
  }

  const renderDevice = (device: any) => {
    const isOnline = device.status === 'online' || device.online
    const folderName = device.folderName || 'Unknown'

    return (
      <div
        key={device.id}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
          selectedDevice?.id === device.id ? 'bg-primary/10 border-primary/20' : 'bg-surface/50'
        } transition-colors cursor-pointer hover:bg-primary/5`}
        onClick={() => setSelectedDevice(selectedDevice?.id === device.id ? null : device.id)}
      >
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success pulse-glow' : 'bg-danger'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium {isOnline ? 'text-slate-100' : 'text-slate-400'}">
            {device.name || `Phone ${device.id.slice(-4)}`}
          </div>
          <div className="text-[10px] text-slate-500">
            {device.ip || 'Not paired'} • {device.model || ''}
          </div>
        </div>
        {device.model && (
          <div className="text-[10px] text-slate-500">
            {device.model}
          </div>
        )}
        {isOnline && (
          <div className="flex gap-1">
            <button
              onClick={() => sendCommand(device, 'keyevent 82')}
              className="px-2 py-0.5 rounded-xs text-[8px] text-primary hover:text-primary/80 transition cursor-pointer"
              title="Unlock"
            >
              <Key className="text-[7px]" />
            </button>
            <button
              onClick={() => sendCommand(device, 'keyevent 26')}
              className="px-2 py-0.5 rounded-xs text-[8px] text-danger hover:text-danger/80 transition cursor-pointer"
              title="Lock"
            >
              <Lock className="text-[7px]" />
            </button>
            <button
              onClick={() => sendCommand(device, 'screencap')}
              className="px-2 py-0.5 rounded-xs text-[8px] text-primary hover:text-primary/80 transition cursor-pointer"
              title="Screenshot"
            >
              <Camera className="text-[7px]" />
            </button>
          </div>
        )}
        {isOnline && (
          <div className="flex gap-1 mt-2 text-xs">
            <button
              onClick={() => fetch('/api/adb/os/open-notebook')}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Open Notepad"
            >
              <Keyboard className="mr-1 text-[7px]" /> Notepad
            </button>
            <button
              onClick={() => fetch('/api/adb/os/write-notebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hello from Calamox', wait: 1.0 })
              })}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Write to Notepad"
            >
              <Mouse className="mr-1 text-[7px]" /> Write
            </button>
            <button
              onClick={() => fetch('/api/adb/os/open-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone_number: '+1234567890', message: 'Hello!' })
              })}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Open WhatsApp"
            >
              <Phone className="mr-1 text-[7px]" /> WhatsApp
            </button>
            <button
              onClick={() => fetch('/api/adb/os/organize-downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extensions: ['.pdf', '.jpg'] })
              })}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Organize Downloads"
            >
              <Folder className="mr-1 text-[7px]" /> Downloads
            </button>
          </div>
        )}
        {(!isOnline || selectedDevice?.id === device.id) && (
          <div className="text-[10px] text-slate-500">
            {device.paired ? 'Paired' : 'Not paired'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`${className} w-80 flex-shrink-0 overflow-y-auto bg-surface/80 backdrop-blur-glass border-r border-white/[0.06]`}
    >
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/[0.06]">
        <h2 className="font-bold text-[14px] tracking-tight">Connected Devices</h2>
        <div className="flex items-center gap-2 text-xs">
          {pairingMode === 'none' && (
            <button
              onClick={() => togglePairing('qr')}
              className="px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition cursor-pointer"
              title="Pair via QR Code"
            >
              <Phone className="mr-1" /> QR
            </button>
          )}
          {pairingMode === 'none' && (
            <button
              onClick={() => togglePairing('ip')}
              className="px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition cursor-pointer"
              title="Pair via IP Address"
            >
              <Wifi className="mr-1" /> IP
            </button>
          )}
          {pairingMode !== 'none' && (
            <button
              onClick={cancelPairing}
              className="px-3 py-1.5 rounded-lg text-xs text-danger hover:bg-red-500/10 transition cursor-pointer"
              title="Cancel pairing"
            >
              <XCircle className="mr-1" /> Cancel
            </button>
          )}
        </div>
      </div>

      {pairingMode === 'qr' && (
        <div className="p-4 glass">
          <div className="text-xs text-slate-500 mb-2">Scan QR code to pair</div>
          <input
            type="text"
            value={pairingInput}
            onChange={e => setPairingInput(e.target.value)}
            placeholder="IP address or QR data"
            className="w-full px-3 py-2 glass-input rounded border border-white/[0.06] text-sm"
          />
          <button
            onClick={() => connectDevice(pairingInput)}
            className="w-full px-3 py-2 rounded-lg text-primary hover:bg-primary/10 mt-2 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : 'Pair Device'}
          </button>
        </div>
      )}

      {pairingMode === 'ip' && (
        <div className="p-4 glass">
          <div className="text-xs text-slate-500 mb-2">Enter device IP address</div>
          <input
            type="text"
            value={pairingInput}
            onChange={e => setPairingInput(e.target.value)}
            placeholder "192.168.1.50"
            className="w-full px-3 py-2 glass-input rounded border border-white/[0.06] text-sm"
          />
          <button
            onClick={() => connectDevice(pairingInput)}
            className="w-full px-3 py-2 rounded-lg text-primary hover:bg-primary/10 mt-2 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : 'Pair Device'}
          </button>
        </div>
      )}

      <div className="p-4 overflow-y-auto" style={{ maxHeight: '400px' }}>
        {devices.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No devices connected</p>
            <p className="text-[10px] mt-1">Pair a device via QR or IP address</p>
          </div>
        )}
        {devices.map(renderDevice)}
      </div>

      {/* Selected device details panel */}
      {selectedDevice && devices.length > 0 && (
        <div className="p-4 glass margin-t">
          <h3 className="font-bold text-[12px] mb-3">Device Controls</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => sendCommand(selectedDevice, 'keyevent 82')}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Unlock Screen"
            >
              Unlock
            </button>
            <button
              onClick={() => sendCommand(selectedDevice, 'keyevent 26')}
              className="px-2 py-1 rounded border border-danger/20 text-danger hover:bg-red-500/10 transition cursor-pointer"
              title="Lock Screen"
            >
              Lock
            </button>
            <button
              onClick={() => sendCommand(selectedDevice, 'screencap')}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Screenshot"
            >
              Screenshot
            </button>
            <button
              onClick={() => sendCommand(selectedDevice, 'shell input text "Hello"')}
              className="px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition cursor-pointer"
              title="Send text"
            >
              Text
            </button>
          </div>
        </div>
      )}
    </div>
  )
}