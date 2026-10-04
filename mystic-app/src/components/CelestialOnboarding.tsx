import React from "react";
import { Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";
import signInArtwork from "../assets/images/mystical_tarot_reader_1790704974614.jpg";
import registerArtwork from "../assets/images/mystical_card_back_1790704964638.jpg";

export default function CelestialOnboarding({
  authMode,
  setAuthMode,
  authDisplayName,
  setAuthDisplayName,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  showPassword,
  setShowPassword,
  authError,
  authSuccessMsg,
  handleAuthSubmit,
  handleForgotPassword,
  onGuestExplore
}: any) {
  return (
    <div className="flex-1 flex flex-col justify-center px-2 py-6 text-center space-y-6 fade-in z-20">
      {/* Branding */}
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-wider text-white uppercase">
          CELESTIAL SANCTUARY
        </h1>
        <p className="text-[10px] text-slate-300 tracking-widest text-teal-400 font-semibold">
          GOLDEN CIRCLE MEMBER ARCHIVE
        </p>
      </div>

      {/* Owl Artwork */}
      <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-[#f3c65f] shadow-[0_0_20px_rgba(243,198,95,0.3)] mx-auto">
        <img
          src={authMode === "login" ? signInArtwork : registerArtwork}
          alt={authMode === "login" ? "Sign In artwork" : "Register artwork"}
          className="w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
      </div>

      {/* Heading */}
      <h2 className="text-sm font-display text-slate-200">
        STEP INTO THE SANCTUARY
      </h2>

      {/* Auth Panel */}
      <div className="rounded-2xl border border-mystic-gold/40 bg-black/30 p-5 text-left space-y-4 backdrop-blur-md">
        <div className="flex border-b border-[#2c1654]/40 pb-1">
          <button
            type="button"
            onClick={() => setAuthMode("login")}
            className={`flex-1 py-1 text-center text-xs font-bold tracking-wide uppercase transition-all ${
              authMode === "login" ? "text-mystic-gold border-b-2 border-mystic-gold font-display" : "text-slate-400 font-display"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("register")}
            className={`flex-1 py-1 text-center text-xs font-bold tracking-wide uppercase transition-all ${
              authMode === "register" ? "text-mystic-gold border-b-2 border-mystic-gold font-display" : "text-slate-400 font-display"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-3.5 pt-1 text-xs">
          {authMode === "register" && (
            <input
              type="text"
              placeholder="Chosen Name"
              aria-label="Chosen Name"
              value={authDisplayName}
              onChange={(e) => setAuthDisplayName(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-[#070412] border border-white/10 text-white placeholder-slate-500"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email Coordinate"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            className="w-full p-2.5 rounded-lg bg-[#070412] border border-white/10 text-white placeholder-slate-500"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Passcode"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-[#070412] border border-white/10 text-white placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          
          {authError && <p className="text-red-400 text-[10px]">{authError}</p>}
          {authSuccessMsg && <p className="text-teal-400 text-[10px]">{authSuccessMsg}</p>}

          <button type="submit" className="w-full p-2.5 bg-[#f3c65f] text-[#0b081c] rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-[#b8860b] transition-colors">
            VERIFY SOUL KEY
            <Sparkles size={16} />
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2 items-center text-center">
            <button type="button" onClick={handleForgotPassword} className="text-slate-500 text-[10px] hover:text-[#f3c65f]">
                Forgot Passcode?
            </button>
            <button type="button" onClick={onGuestExplore} className="text-slate-400 text-xs flex items-center gap-1 hover:text-[#f3c65f] transition-colors">
              Guest exploration <ArrowRight size={14} />
            </button>
        </div>
      </div>
    </div>
  );
}
