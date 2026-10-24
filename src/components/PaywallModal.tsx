import React from 'react';
import { Sparkles, X, CheckCircle2, Zap, Shield, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { SubscriptionTier } from '../types';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriptionTier: SubscriptionTier;
  onSelectTier: (tier: SubscriptionTier) => Promise<void>;
  isSubscribing: boolean;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  subscriptionTier,
  onSelectTier,
  isSubscribing,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="paywall-modal-backdrop"
        className="fixed inset-0 z-[110] overflow-y-auto p-3 sm:p-6 flex items-center justify-center bg-black/85 backdrop-blur-md overscroll-contain"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <motion.div 
          id="paywall-modal-card"
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-lg bg-gradient-to-br from-car-card to-[#0d0e12] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto relative text-center"
        >
          {/* Decorative ambient glows */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-car-accent/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button 
            id="btn-close-paywall"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="space-y-1.5 pt-1 pb-4 shrink-0 border-b border-white/5">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-car-accent flex items-center justify-center text-white shadow-lg shadow-car-accent/25">
              <Crown size={24} />
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">DriveLogicAI Subscriptions</h2>
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em]">Select Your Vehicle Intelligence Plan</p>
          </div>

          {/* Scrollable plan cards list */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 overscroll-contain scrollbar-thin scrollbar-thumb-white/20 text-left">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const isCurrent = subscriptionTier === plan.id;
              const isPremium = plan.id === 'premium';
              const isPro = plan.id === 'pro';

              return (
                <div
                  key={plan.id}
                  id={`paywall-card-${plan.id}`}
                  className={cn(
                    "p-4 rounded-2xl border transition-all duration-200 relative overflow-hidden",
                    isPremium 
                      ? "bg-gradient-to-br from-amber-500/15 via-car-card to-car-accent/15 border-amber-500/50 shadow-md shadow-amber-500/10"
                      : isPro
                        ? "bg-gradient-to-br from-car-accent/15 via-car-card to-white/5 border-car-accent/50 shadow-md shadow-car-accent/10"
                        : "bg-white/[0.04] border-white/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        isPremium ? "bg-amber-400" : isPro ? "bg-car-accent" : "bg-white/40"
                      )} />
                      <h3 className="text-sm font-bold text-white tracking-tight">{plan.name} Plan</h3>
                    </div>
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
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-2xl font-extrabold text-white tracking-tight font-mono">{plan.price}</span>
                    <span className="text-xs text-white/50">{plan.period}</span>
                  </div>

                  <p className="text-[11px] text-white/60 mb-2.5 leading-relaxed">
                    {plan.description}
                  </p>

                  <ul className="space-y-1 mb-3">
                    {plan.features.slice(0, 3).map((feat, idx) => (
                      <li key={idx} className="text-[10px] text-white/70 flex items-center gap-1.5">
                        <CheckCircle2 size={11} className={cn(
                          "shrink-0",
                          isPremium ? "text-amber-400" : isPro ? "text-car-accent" : "text-white/40"
                        )} />
                        <span className="truncate">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="w-full py-2 rounded-xl bg-white/10 border border-white/15 text-white/60 text-xs font-mono font-bold text-center">
                      CURRENT ACTIVE PLAN
                    </div>
                  ) : (
                    <button
                      id={`btn-paywall-activate-${plan.id}`}
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
                          {plan.id === 'free' ? 'Continue with Free' : `Activate ${plan.name} for ${plan.price}`}
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-2 shrink-0 border-t border-white/5">
            <p className="text-[9px] text-white/30 font-mono">
              Switch or cancel anytime under Settings. Instant activation.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
