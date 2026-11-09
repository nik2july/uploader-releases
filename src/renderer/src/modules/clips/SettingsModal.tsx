import React, { useState, useEffect } from 'react';
import { X, Sliders, MessageCircle, HardDrive, Phone, Cloud, ExternalLink } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waToken, setWaToken] = useState('');
  const [dbxKey, setDbxKey] = useState('');
  const [dbxSecret, setDbxSecret] = useState('');
  const [dbxToken, setDbxToken] = useState('');
  const [dbxEmail, setDbxEmail] = useState<string | null>(null);
  const [dbxTesting, setDbxTesting] = useState(false);
  const [dbxStatusMsg, setDbxStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      window.clipsApi.getWhatsAppConfig().then(cfg => {
        if (cfg) {
          setWaPhoneNumberId(cfg.phoneNumberId || '');
          setWaToken(cfg.accessToken || '');
        }
      });
      window.clipsApi.getDropboxConfig().then(cfg => {
        if (cfg) {
          setDbxKey(cfg.appKey || '');
          setDbxSecret(cfg.appSecret || '');
          setDbxToken(cfg.refreshToken || cfg.accessToken || '');
        }
      });
      window.clipsApi.testDropboxConnection().then(res => {
        if (res.ok && res.email) {
          setDbxEmail(res.email);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestDropbox = async () => {
    setDbxTesting(true);
    setDbxStatusMsg(null);
    try {
      const res = await window.clipsApi.configureDropbox({
        appKey: dbxKey.trim(),
        appSecret: dbxSecret.trim(),
        refreshToken: dbxToken.trim()
      });
      if (res.ok) {
        setDbxEmail(res.email || 'Connected');
        setDbxStatusMsg({ type: 'success', text: `✓ Connected to Dropbox (${res.email})` });
      } else {
        setDbxEmail(null);
        setDbxStatusMsg({ type: 'error', text: `⚠ ${res.error || 'Connection failed. Check credentials.'}` });
      }
    } catch (err: any) {
      setDbxStatusMsg({ type: 'error', text: `⚠ ${err?.message || 'Connection failed'}` });
    } finally {
      setDbxTesting(false);
    }
  };

  const handleSave = async () => {
    await window.clipsApi.updateWhatsAppConfig({
      phoneNumberId: waPhoneNumberId,
      accessToken: waToken
    });

    const res = await window.clipsApi.configureDropbox({
      appKey: dbxKey.trim(),
      appSecret: dbxSecret.trim(),
      refreshToken: dbxToken.trim()
    });

    if (res.ok) {
      setDbxEmail(res.email || 'Connected');
      setSavedMsg(`✓ Settings saved! Connected to Dropbox (${res.email || 'Active'}).`);
    } else {
      setSavedMsg('✓ Settings saved.');
    }

    setTimeout(() => {
      setSavedMsg(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141110] border border-[#2D2824] rounded-2xl w-full max-w-xl p-6 flex flex-col gap-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#2D2824]">
          <h2 className="text-base font-bold text-[#FBFAF7] font-serif flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#E8A317]" />
            Studio Cloud &amp; API Configuration
          </h2>
          <button onClick={onClose} className="text-[#8C857B] hover:text-[#FBFAF7] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WhatsApp Cloud API */}
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-[#FBFAF7] flex items-center gap-1.5 font-mono uppercase text-[#2A9D8F]">
            <MessageCircle className="w-4 h-4" /> Meta WhatsApp Cloud API
          </span>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#8C857B]">WhatsApp Phone Number ID</label>
            <input
              type="text"
              value={waPhoneNumberId}
              onChange={e => setWaPhoneNumberId(e.target.value)}
              className="bg-[#1F1B18] border border-[#2D2824] rounded px-3 py-1.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#8C857B]">Graph API Access Token</label>
            <input
              type="password"
              value={waToken}
              onChange={e => setWaToken(e.target.value)}
              className="bg-[#1F1B18] border border-[#2D2824] rounded px-3 py-1.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
            />
          </div>
        </div>

        {/* Studio Dropbox Credentials */}
        <div className="flex flex-col gap-3 pt-3 border-t border-[#2D2824]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#FBFAF7] flex items-center gap-1.5 font-mono uppercase text-[#60A5FA]">
              <HardDrive className="w-4 h-4" /> Studio 2TB Dropbox
            </span>
            {dbxEmail && (
              <span className="text-[11px] font-mono text-[#2A9D8F] bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                ✓ Connected: {dbxEmail}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#8C857B]">App Key</label>
              <input
                type="text"
                value={dbxKey}
                onChange={e => setDbxKey(e.target.value)}
                placeholder="Optional if token is pre-scoped"
                className="bg-[#1F1B18] border border-[#2D2824] rounded px-3 py-1.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#8C857B]">App Secret</label>
              <input
                type="password"
                value={dbxSecret}
                onChange={e => setDbxSecret(e.target.value)}
                placeholder="Optional"
                className="bg-[#1F1B18] border border-[#2D2824] rounded px-3 py-1.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-[#8C857B]">Dropbox Refresh Token / Access Token</label>
              <a
                href="https://www.dropbox.com/developers/apps"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#60A5FA] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" /> Dropbox App Console ↗
              </a>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={dbxToken}
                onChange={e => setDbxToken(e.target.value)}
                placeholder="Paste Dropbox token (e.g. sl.u.AF...)"
                className="flex-1 bg-[#1F1B18] border border-[#2D2824] rounded px-3 py-1.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={handleTestDropbox}
                disabled={dbxTesting || !dbxToken}
                className="px-3 py-1.5 rounded bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#60A5FA] disabled:opacity-40 cursor-pointer"
              >
                {dbxTesting ? 'Verifying…' : 'Test Connection'}
              </button>
            </div>
            <div className="p-2 rounded bg-[#1F1B18] border border-[#2D2824] text-[10px] text-[#8C857B] leading-relaxed">
              💡 <b>Required Scopes:</b> Ensure your Dropbox App has <span className="text-[#FBFAF7]">files.content.write</span>, <span className="text-[#FBFAF7]">files.metadata.write</span>, and <span className="text-[#FBFAF7]">sharing.write</span> enabled under the Permissions tab in Dropbox App Console, then generate a new token.
            </div>
          </div>

          {dbxStatusMsg && (
            <div
              className={`p-2.5 rounded text-xs font-semibold ${
                dbxStatusMsg.type === 'success'
                  ? 'bg-[#2A9D8F]/15 border border-[#2A9D8F]/40 text-[#2A9D8F] text-center'
                  : 'bg-[#E63946]/15 border border-[#E63946]/40 text-[#E63946]'
              }`}
            >
              {dbxStatusMsg.text}
            </div>
          )}
        </div>

        {/* Post-Production Hotline Info */}
        <div className="p-3 rounded-lg bg-[#1F1B18] border border-[#3D3630] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#FBFAF7]">
            <Phone className="w-4 h-4 text-[#E8A317]" />
            <span>Post-Production Client Calling Hotline:</span>
          </div>
          <span className="font-mono font-bold text-[#E8A317]">+91 88945 62004</span>
        </div>

        {savedMsg && (
          <div className="p-2 rounded bg-[#2A9D8F]/15 border border-[#2A9D8F]/40 text-[#2A9D8F] text-xs font-semibold text-center">
            {savedMsg}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-[#2D2824]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs text-[#8C857B] hover:text-[#FBFAF7]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="sindoor-gradient-btn px-5 py-2 rounded-lg text-xs font-semibold shadow-md cursor-pointer"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
