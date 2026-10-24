import React, { useState } from 'react';
import { CreditCard, Check, Shield, Zap, Sparkles, Heart, Coffee, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const SUBSCRIPTION_TIERS = [
  {
    id: 'free',
    name: 'Standard',
    price: '$0',
    interval: 'forever',
    features: [
      'Basic OBD-II Diagnostics (Generic PIDs)',
      'Real-time GPS Tracking',
      'AI Diagnosis (3/day)',
      'Local Trip Storage'
    ],
    recommended: false,
    color: 'text-white',
    bg: 'bg-white/5',
    border: 'border-white/10',
  },
  {
    id: 'pro',
    name: 'Pro Diagnostics',
    price: '$9.99',
    interval: '/month',
    features: [
      'Advanced Manufacturer PIDs (1996+)',
      'Unlimited AI Diagnostics & Voice Chat',
      'Cloud Backup & Drive Sync',
      'Live Sensor Data Graphing',
      'Priority Support'
    ],
    recommended: true,
    color: 'text-car-accent',
    bg: 'bg-car-accent/10',
    border: 'border-car-accent/30',
  },
  {
    id: 'lifetime',
    name: 'Lifetime Pro',
    price: '$149.99',
    interval: 'one-time',
    features: [
      'All Pro Diagnostics Features',
      'Lifetime Updates & New Features',
      'Early Access to Beta Tools',
      'VIP Support Queue'
    ],
    recommended: false,
    color: 'text-car-purple',
    bg: 'bg-car-purple/10',
    border: 'border-car-purple/30',
  }
];

const DONATION_TIERS = [
  { amount: 5, label: 'Coffee', icon: Coffee },
  { amount: 15, label: 'Lunch', icon: Heart },
  { amount: 50, label: 'Sponsor', icon: Shield },
];

export default function SubscriptionTab() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [loadingDonation, setLoadingDonation] = useState<number | null>(null);
  const [customDonation, setCustomDonation] = useState('');

  const handleSubscribe = async (tierId: string) => {
    setLoadingTier(tierId);
    // Simulate API call for subscription checkout
    setTimeout(() => {
      setLoadingTier(null);
      alert(`Subscription checkout for ${tierId.toUpperCase()} tier would open here.`);
    }, 1500);
  };

  const handleDonate = async (amount: number) => {
    setLoadingDonation(amount);
    // Simulate API call for donation checkout
    setTimeout(() => {
      setLoadingDonation(null);
      alert(`Donation checkout for $${amount} would open here. Thank you for your support!`);
    }, 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-20">
      
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-white tracking-tight">Unlock Professional Capabilities</h2>
        <p className="text-white/60 text-sm max-w-xl mx-auto leading-relaxed">
          Get access to manufacturer-specific OBD-II protocols, advanced AI diagnostics, and unlimited cloud features.
        </p>
      </div>

      {/* Subscription Pricing Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {SUBSCRIPTION_TIERS.map((tier) => (
          <div 
            key={tier.id}
            className={cn(
              "relative rounded-3xl p-6 glass-card flex flex-col justify-between border-2 transition-all duration-300 hover:-translate-y-1",
              tier.recommended ? 'border-car-accent shadow-xl shadow-car-accent/10' : 'border-transparent hover:border-white/10'
            )}
          >
            {tier.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-car-accent text-white text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-full shadow-lg">
                  Most Popular
                </span>
              </div>
            )}
            
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className={cn("text-lg font-bold font-mono tracking-tight", tier.color)}>{tier.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-black text-white">{tier.price}</span>
                  <span className="text-xs text-white/40 uppercase tracking-widest">{tier.interval}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                {tier.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("p-1 rounded-full shrink-0 mt-0.5", tier.bg)}>
                      <Check size={10} className={tier.color} />
                    </div>
                    <span className="text-sm text-white/70 leading-snug">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleSubscribe(tier.id)}
              disabled={loadingTier !== null}
              className={cn(
                "mt-8 w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                tier.recommended 
                  ? "bg-car-accent hover:bg-car-accent/90 text-white shadow-lg shadow-car-accent/20" 
                  : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
              )}
            >
              {loadingTier === tier.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                tier.id === 'free' ? 'Current Plan' : 'Select Plan'
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Donation Section */}
      <div className="glass-card rounded-3xl p-8 border border-white/5 mt-12 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
          <Heart size={200} className="text-car-danger" />
        </div>
        
        <div className="relative z-10 space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Heart className="text-car-danger" size={24} /> Support the Project
            </h3>
            <p className="text-sm text-white/60 max-w-2xl">
              GPS Route Logic is built by automotive enthusiasts. If you find our tools useful, consider leaving a tip to help us keep the servers running and add support for more vehicle models.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            {DONATION_TIERS.map((tier) => (
              <button
                key={tier.amount}
                onClick={() => handleDonate(tier.amount)}
                disabled={loadingDonation !== null}
                className="flex-1 min-w-[120px] p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all hover:border-car-danger/30 hover:shadow-lg hover:shadow-car-danger/5"
              >
                {loadingDonation === tier.amount ? (
                  <Loader2 size={24} className="animate-spin text-car-danger" />
                ) : (
                  <tier.icon size={24} className="text-car-danger/70" />
                )}
                <div className="text-center">
                  <div className="text-lg font-bold text-white">${tier.amount}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-widest">{tier.label}</div>
                </div>
              </button>
            ))}
            
            <div className="flex-1 min-w-[200px] p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col justify-center gap-3">
              <span className="text-[10px] text-white/40 uppercase tracking-widest text-center">Custom Amount</span>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                  <input 
                    type="number" 
                    min="1"
                    value={customDonation}
                    onChange={(e) => setCustomDonation(e.target.value)}
                    placeholder="25"
                    className="w-full bg-black/20 border border-white/10 rounded-lg py-2 pl-7 pr-3 text-white text-sm focus:outline-none focus:border-car-danger/50 transition-colors"
                  />
                </div>
                <button 
                  onClick={() => handleDonate(Number(customDonation) || 25)}
                  disabled={loadingDonation !== null || !customDonation}
                  className="px-4 py-2 bg-white/10 hover:bg-car-danger/80 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 h-full"
                >
                  Donate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
