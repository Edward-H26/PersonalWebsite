import type { CSSProperties } from "react"
import { PROFILE_OVERVIEW } from "@/config/profile"
import { LinkedText } from "@/components/ui/LinkedText"

export function OverviewPage() {
  const glassStyle = {
    "--glass-bg-alpha": 0.18,
    "--glass-before-opacity": 0.3,
    "--glass-after-opacity": 0.28
  } as CSSProperties

  return (
    <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+1rem)] px-4 md:inset-x-auto md:left-8 md:top-32 md:px-0">
      <div
        className="liquid-glass-panel glass-card glass-card-border-glow w-full max-h-[calc(100svh-6rem)] overflow-hidden md:w-[560px] md:max-w-[86vw] md:max-h-none"
        style={glassStyle}
      >
        <div className="liquid-card-scroll max-h-[calc(100svh-6rem)] overflow-y-auto p-5 pt-6 md:max-h-none md:overflow-visible md:p-6 md:pt-7">
          <div className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-end min-[520px]:justify-start min-[520px]:gap-8">
            <div className="text-white text-3xl min-[390px]:text-4xl md:text-6xl font-orbitron font-bold tracking-[0.08em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.65)]">
              <div className="animate-fade-up" style={{ animationDelay: "0.1s", animationFillMode: "both" }}>{PROFILE_OVERVIEW.greeting}</div>
              <div className="liquid-glass-text animate-fade-up" style={{ animationDelay: "0.2s", animationFillMode: "both" }}>{PROFILE_OVERVIEW.name}</div>
            </div>

            <div className="flex items-center gap-3 animate-fade-up min-[520px]:pb-1" style={{ animationDelay: "0.3s", animationFillMode: "both" }}>
              {PROFILE_OVERVIEW.institutions.map((institution) => (
                <div
                  key={institution.name}
                  className="h-10 w-10 rounded-xl bg-white/88 p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.28)] flex items-center justify-center md:h-12 md:w-12"
                  title={institution.name}
                >
                  <img src={institution.image} alt={institution.name} className="h-full w-full object-contain" />
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-4 flex max-w-[62ch] flex-col gap-3 text-[14px] leading-[1.55] text-white/88 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] animate-fade-up md:text-[17px] md:leading-[1.6]"
            style={{ animationDelay: "0.4s", animationFillMode: "both" }}
          >
            <p>
              <LinkedText text={PROFILE_OVERVIEW.bio} />
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
