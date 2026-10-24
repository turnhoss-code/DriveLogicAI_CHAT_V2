import React, { useState } from 'react';
import { 
  Settings, 
  X, 
  Key, 
  Wrench, 
  Sparkles, 
  Check, 
  CheckCircle2, 
  Shield, 
  Zap, 
  RotateCcw, 
  LogOut, 
  Eye, 
  EyeOff, 
  Crown,
  Volume2,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { PostCommandActions, SubscriptionTier } from '../types';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: { gemini: string; maps: string };
  setApiKeys: React.Dispatch<React.SetStateAction<{ gemini: string; maps: string }>>;
  saveApiKeys: () => void;
  vehicleModel: string;
  setVehicleModel: (val: string) => void;
  subscriptionTier: SubscriptionTier;
  onSelectTier: (tier: SubscriptionTier) => Promise<void>;
  isSubscribing: boolean;
  postCommandActions: PostCommandActions;
  setPostCommandActions: React.Dispatch<React.SetStateAction<PostCommandActions>>;
  user: any;
  onSignOut: () => void;
  defaultMapsKey: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKeys,
  setApiKeys,
  saveApiKeys,
  vehicleModel,
  setVehicleModel,
  subscriptionTier,
  onSelectTier,
  isSubscribing,
  postCommandActions,
  setPostCommandActions,
  user,
  onSignOut,
  defaultMapsKey,
}) => {
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showMapsKey, setShowMapsKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [geminiVolume, setGeminiVolume] = useState<'low' | 'medium' | 'high'>(() => {
    return (localStorage.getItem('ztcd_gemini_voice_volume') as 'low' | 'medium' | 'high') || 'low';
  });

  const handleVolumeChange = (newVol: 'low' | 'medium' | 'high') => {
    setGeminiVolume(newVol);
    localStorage.setItem('ztcd_gemini_voice_volume', newVol);
  };

  const handleSave = () => {
    saveApiKeys();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="settings-modal-backdrop"
        className="fixed inset-0 z-[100] overflow-y-auto p-3 sm:p-6 flex items-center justify-center bg-black/85 backdrop-blur-md overscroll-contain"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <motion.div 
          id="settings-modal-card"
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-lg glass-card rounded-3xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto"
        >
          {/* Header - Pinned at top of modal */}
          <div className="p-4 sm:p-5 flex justify-between items-center border-b border-white/10 shrink-0 bg-car-card/90 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-car-accent/15 border border-car-accent/30 rounded-2xl text-car-accent shadow-sm">
                <Settings size={20} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Settings</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Tier:</span>
                  <span className={cn(
                    "text-[10px] font-bold font-mono px-2 py-0.5 rounded-md border uppercase tracking-wider",
                    subscriptionTier === 'premium' && "bg-amber-500/20 text-amber-300 border-amber-500/40",
                    subscriptionTier === 'pro' && "bg-car-accent/20 text-car-accent border-car-accent/40",
                    subscriptionTier === 'free' && "bg-white/5 text-white/50 border-white/10"
                  )}>
                    {subscriptionTier === 'premium' ? 'Premium ($4.99/mo)' : subscriptionTier === 'pro' ? 'Pro ($0.99/mo)' : 'Free Plan'}
                  </span>
                </div>
              </div>
            </div>
            <button 
              id="btn-close-settings"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all cursor-pointer"
              title="Close Settings"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div 
            id="settings-scroll-container"
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 overscroll-contain scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
          >
            {/* Subscription Tiers Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs uppercase font-mono tracking-wider text-white/90 font-bold flex items-center gap-1.5">
                    <Crown size={14} className="text-amber-400" />
                    Subscription Plans
                  </h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Upgrade anytime to unlock real-time Gemini voice and deep AI diagnostics.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const isCurrent = subscriptionTier === plan.id;
                  const isPremium = plan.id === 'premium';
                  const isPro = plan.id === 'pro';

                  return (
                    <div
                      key={plan.id}
                      id={`subscription-card-${plan.id}`}
                      className={cn(
                        "relative p-4 rounded-2xl border transition-all duration-200 overflow-hidden",
                        isCurrent 
                          ? isPremium
                            ? "bg-gradient-to-br from-amber-500/15 via-car-card to-car-accent/15 border-amber-500/50 shadow-lg shadow-amber-500/10"
                            : isPro
                              ? "bg-gradient-to-br from-car-accent/15 via-car-card to-white/5 border-car-accent/50 shadow-lg shadow-car-accent/10"
                              : "bg-white/10 border-white/30"
                          : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10"
                      )}
                    >
                      {/* Badge */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            isPremium ? "bg-amber-400" : isPro ? "bg-car-accent" : "bg-white/40"
                          )} />
                          <h4 className="text-sm font-bold text-white tracking-tight">{plan.name}</h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {plan.badge && (
                            <span className={cn(
                              "text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border",
                              isPremium 
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40" 
                                : isPro
                                  ? "bg-car-accent/20 text-car-accent border-car-accent/40"
                                  : "bg-white/5 text-white/40 border-white/10"
                            )}>
                              {plan.badge}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[9px] font-mono font-bold bg-car-success/20 text-car-success border border-car-success/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Check size={10} /> ACTIVE
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Pricing */}
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <span className="text-2xl font-extrabold text-white tracking-tight font-mono">{plan.price}</span>
                        <span className="text-xs text-white/50">{plan.period}</span>
                      </div>

                      <p className="text-[11px] text-white/60 leading-relaxed mb-3">
                        {plan.description}
                      </p>

                      {/* Features list */}
                      <ul className="space-y-1.5 mb-3 border-t border-white/5 pt-2.5">
                        {plan.features.map((feat, idx) => (
                          <li key={idx} className="text-[10px] text-white/70 flex items-start gap-1.5">
                            <CheckCircle2 size={12} className={cn(
                              "shrink-0 mt-0.5",
                              isPremium ? "text-amber-400" : isPro ? "text-car-accent" : "text-white/40"
                            )} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Action Button */}
                      {isCurrent ? (
                        <div className="w-full py-2 px-3 rounded-xl bg-white/10 border border-white/15 text-white/60 text-xs font-bold font-mono text-center flex items-center justify-center gap-1.5 cursor-default">
                          <Check size={14} className="text-car-success" />
                          CURRENT SUBSCRIPTION
                        </div>
                      ) : (
                        <button
                          id={`btn-select-tier-${plan.id}`}
                          onClick={() => onSelectTier(plan.id)}
                          disabled={isSubscribing}
                          className={cn(
                            "w-full py-2.5 px-3 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98]",
                            isPremium 
                              ? "bg-gradient-to-r from-amber-500 to-car-accent hover:brightness-110 text-white shadow-car-accent/20"
                              : isPro 
                                ? "bg-car-accent hover:bg-car-accent/90 text-white shadow-car-accent/15"
                                : "bg-white/10 hover:bg-white/15 text-white/80 border border-white/15"
                          )}
                        >
                          {isSubscribing ? (
                            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              {isPremium && <Sparkles size={13} className="text-amber-200" />}
                              {isPro && <Zap size={13} className="text-white" />}
                              {plan.id === 'free' ? 'Switch to Free' : `Activate ${plan.name} (${plan.price})`}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Gemini Voice Volume Section */}
            <section className="space-y-3 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-mono flex items-center gap-2 font-bold">
                  <Volume2 size={12} className="text-car-accent" />
                  Gemini Voice Volume
                </label>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-car-accent/20 text-car-accent uppercase font-bold">
                  {geminiVolume} (Active)
                </span>
              </div>
              <p className="text-[10px] text-white/40">
                Adjust the voice output volume for Gemini continuous co-pilot speech responses.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'low', label: 'Low', desc: 'Soft & quiet' },
                  { id: 'medium', label: 'Medium', desc: 'Balanced road level' },
                  { id: 'high', label: 'High', desc: 'Loud cabin audio' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleVolumeChange(item.id as any)}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                      geminiVolume === item.id 
                        ? "bg-car-accent/20 border-car-accent text-white shadow-sm ring-1 ring-car-accent/50" 
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span className="text-xs font-bold font-mono uppercase">{item.label}</span>
                    <span className="text-[9px] text-white/40 mt-1 leading-tight">{item.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Vehicle Selection Section */}
            <section className="space-y-2 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
              <label 
                htmlFor="input-vehicle-model"
                className="text-[10px] uppercase tracking-widest text-white/60 font-mono flex items-center gap-2 font-bold"
              >
                <Wrench size={12} className="text-car-accent" />
                Vehicle Profile
              </label>
              <input 
                id="input-vehicle-model"
                type="text"
                value={vehicleModel}
                onChange={(e) => {
                  setVehicleModel(e.target.value);
                  localStorage.setItem('ztcd_vehicle_model', e.target.value);
                }}
                placeholder="e.g., 2023 Toyota Camry LE"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-car-accent text-white font-mono transition-colors"
              />
              <p className="text-[10px] text-white/40">
                Supplied to the Gemini AI reasoning model for vehicle-specific diagnostic accuracy.
              </p>
            </section>

            {/* API Keys Configuration */}
            <section className="space-y-3 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
              <h3 className="text-[10px] uppercase tracking-widest text-white/60 font-mono font-bold flex items-center gap-2">
                <Key size={12} className="text-car-accent" />
                Custom API Credentials
              </h3>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="input-gemini-key" className="text-[10px] text-white/50 font-mono">
                    Gemini API Key
                  </label>
                  <span className="text-[9px] text-white/30 font-mono">Default: Built-in</span>
                </div>
                <div className="relative">
                  <input 
                    id="input-gemini-key"
                    type={showGeminiKey ? "text" : "password"}
                    value={apiKeys.gemini}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder="Enter Gemini API Key (optional)"
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 pr-10 text-xs focus:outline-none focus:border-car-accent font-mono text-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                    title={showGeminiKey ? "Hide key" : "Show key"}
                  >
                    {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center">
                  <label htmlFor="input-maps-key" className="text-[10px] text-white/50 font-mono">
                    Google Maps API Key
                  </label>
                  <span className="text-[9px] text-white/30 font-mono">
                    {apiKeys.maps !== defaultMapsKey ? "Custom key active" : "Default: System Key"}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    id="input-maps-key"
                    type={showMapsKey ? "text" : "password"}
                    value={apiKeys.maps}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, maps: e.target.value }))}
                    placeholder="Enter Google Maps API Key (optional)"
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 pr-10 text-xs focus:outline-none focus:border-car-accent font-mono text-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMapsKey(!showMapsKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                    title={showMapsKey ? "Hide key" : "Show key"}
                  >
                    {showMapsKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </section>

            {/* Voice Command Actions Configuration */}
            <section className="space-y-3 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2">
                <Volume2 size={13} className="text-car-accent" />
                <h3 className="text-[10px] uppercase tracking-widest font-mono text-white/80 font-bold">
                  Voice Command Automations
                </h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label htmlFor="select-action-tab" className="text-[9px] uppercase tracking-widest text-white/40 font-mono">
                    On Tab Switch
                  </label>
                  <select
                    id="select-action-tab"
                    value={postCommandActions.changeTab}
                    onChange={(e) => setPostCommandActions(prev => ({ ...prev, changeTab: e.target.value as any }))}
                    className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                  >
                    <option value="none">Do Nothing</option>
                    <option value="speakTab">Speak Tab Title</option>
                    <option value="triggerSim">Toggle OBD Sim</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="select-action-nav" className="text-[9px] uppercase tracking-widest text-white/40 font-mono">
                    On Route Set
                  </label>
                  <select
                    id="select-action-nav"
                    value={postCommandActions.setNavigation}
                    onChange={(e) => setPostCommandActions(prev => ({ ...prev, setNavigation: e.target.value as any }))}
                    className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                  >
                    <option value="none">Do Nothing</option>
                    <option value="autoRecord">Auto-Record Trip</option>
                    <option value="switchTab">Show GPS Tab</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="select-action-diag" className="text-[9px] uppercase tracking-widest text-white/40 font-mono">
                    On Diagnose Run
                  </label>
                  <select
                    id="select-action-diag"
                    value={postCommandActions.diagnoseVehicle}
                    onChange={(e) => setPostCommandActions(prev => ({ ...prev, diagnoseVehicle: e.target.value as any }))}
                    className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                  >
                    <option value="none">Do Nothing</option>
                    <option value="switchOBD">Show OBD Tab</option>
                    <option value="speakHealth">Speak Health Index</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="select-action-rec" className="text-[9px] uppercase tracking-widest text-white/40 font-mono">
                    On Record Toggle
                  </label>
                  <select
                    id="select-action-rec"
                    value={postCommandActions.toggleRecording}
                    onChange={(e) => setPostCommandActions(prev => ({ ...prev, toggleRecording: e.target.value as any }))}
                    className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                  >
                    <option value="none">Do Nothing</option>
                    <option value="switchGPS">Show GPS Tab</option>
                    <option value="speakStatus">Speak Status</option>
                  </select>
                </div>
              </div>
            </section>
            
            {/* Voice Command Reference Cheatsheet */}
            <section className="space-y-2 bg-white/[0.02] p-4 rounded-2xl border border-white/10">
              <h3 className="text-[10px] uppercase tracking-widest font-mono text-white/60 font-bold flex items-center gap-1.5">
                <HelpCircle size={12} className="text-white/40" />
                Voice Commands Reference
              </h3>
              <ul className="text-[11px] space-y-1 text-white/60 list-disc list-inside">
                <li><strong className="text-white/90">"Hey Drive Logic"</strong> - Wake assistant</li>
                <li><strong className="text-white/90">"Show me my maintenance tasks"</strong> - Switch tabs</li>
                <li><strong className="text-white/90">"Diagnose my vehicle"</strong> - Run diagnostics</li>
                <li><strong className="text-white/90">"Start recording" / "Stop recording"</strong> - Trip logger</li>
                <li><strong className="text-white/90">"Navigate from [A] to [B]"</strong> - GPS routing</li>
              </ul>
            </section>

            {/* Danger / Account Actions */}
            <section className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex gap-2">
                <button 
                  id="btn-reset-keys"
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('ztcd_maps_api_key');
                    localStorage.removeItem('ztcd_gemini_api_key');
                    window.location.reload();
                  }}
                  className="flex-1 py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl font-bold font-mono text-[10px] uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  Reset API Keys
                </button>

                <button
                  id="btn-sign-out"
                  type="button"
                  onClick={onSignOut}
                  className="flex-1 py-2.5 px-3 bg-car-danger/15 hover:bg-car-danger/25 border border-car-danger/30 text-car-danger rounded-xl font-bold font-mono text-[10px] uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={12} />
                  Sign Out
                </button>
              </div>
            </section>
          </div>

          {/* Footer - Pinned at bottom of modal */}
          <div className="p-4 sm:p-5 border-t border-white/10 shrink-0 bg-car-card/90 backdrop-blur-xl flex items-center gap-3">
            <button 
              id="btn-close-settings-footer"
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 px-4 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Close
            </button>
            <button 
              id="btn-save-settings"
              type="button"
              onClick={handleSave}
              className="w-2/3 py-3 px-4 bg-car-accent hover:bg-car-accent/90 active:scale-[0.98] text-white rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg shadow-car-accent/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check size={14} className="text-white" />
                  SAVED!
                </>
              ) : (
                "SAVE CONFIGURATION"
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
