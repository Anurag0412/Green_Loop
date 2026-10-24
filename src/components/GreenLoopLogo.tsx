import React from 'react';

interface GreenLoopLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  className?: string;
}

/**
 * Official Green Loop Neo-Brutalist Botanical & Cycle Seal Logo
 * Renders a crisp, multi-layered SVG emblem (interlocking cycle loop, sprouted leaf,
 * soil horizon lines, and corner registration ticks) with zero external asset dependency.
 */
export function GreenLoopLogo({
  size = 'md',
  showText = true,
  subtitle = 'AgroTech Field Journal',
  className = '',
}: GreenLoopLogoProps) {
  const dimensions = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16',
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div
        className={`${dimensions} relative shrink-0 rounded-xl bg-[#006c48] border-[2.5px] border-[#012d1d] shadow-[3px_3px_0px_#012d1d] flex items-center justify-center overflow-hidden group-hover:-translate-y-0.5 transition-transform`}
      >
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          aria-label="Green Loop Brand Emblem"
          role="img"
        >
          {/* Subtle grid lines inside seal */}
          <path
            d="M0 16H64M0 32H64M0 48H64M16 0V64M32 0V64M48 0V64"
            stroke="#8af6b8"
            strokeOpacity="0.18"
            strokeWidth="1"
          />

          {/* Sun / Harvest Gold Halo */}
          <circle
            cx="47"
            cy="16"
            r="7.5"
            fill="#ffdb92"
            stroke="#012d1d"
            strokeWidth="2.5"
          />

          {/* Soil / Terraced Horizon Base */}
          <path
            d="M6 50C16 45 27 45 38 49C47 52 54 51 58 48V58H6V50Z"
            fill="#012d1d"
          />
          <path
            d="M8 53H56"
            stroke="#ffdb92"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="4 4"
          />

          {/* Outer Continuous Green Loop (Seed-to-Market Cycle Ring) */}
          <path
            d="M17 39C12.5 34.5 12.5 25.5 18 20C23.5 14.5 32.5 15 38 20.5L43 25.5"
            stroke="#8af6b8"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M47 28C50.5 33.5 49.5 41.5 44 46C38.5 50.5 29.5 50 24 44.5"
            stroke="#ffdb92"
            strokeWidth="4.5"
            strokeLinecap="round"
          />

          {/* Loop Arrowhead */}
          <path
            d="M44 19L45.5 27.5L37 26"
            stroke="#012d1d"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M43 18L44.5 26.5L36 25"
            stroke="#8af6b8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Central Botanical Leaf Sprout */}
          <path
            d="M22 42C22 28 33 19 45 19C45 31 36 42 22 42Z"
            fill="#8af6b8"
            stroke="#012d1d"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Leaf Left Cotyledon */}
          <path
            d="M23 38C15 36 12 29 14 22C21 22 26 28 25 36"
            fill="#92f7c3"
            stroke="#012d1d"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Leaf Central Stem & Veins */}
          <path
            d="M20 45C25 37 31 30 39 24"
            stroke="#012d1d"
            strokeWidth="2.75"
            strokeLinecap="round"
          />
          <path
            d="M29 33L35 33M26 37L32 37"
            stroke="#012d1d"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight leading-none font-extrabold">
              GREEN LOOP
            </span>
            <span className="px-1.5 py-0.5 rounded bg-tertiary-fixed border-[1.5px] border-primary font-mono text-[10px] font-bold text-primary -rotate-2 shadow-[1.5px_1.5px_0px_#012d1d] leading-none">
              SEAL V2.4
            </span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-0.5">
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Custom Cadastral Farm Seal SVG for Farm Identity Badges
 */
export function FarmSealSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="32"
        height="32"
        rx="8"
        fill="#ffdb92"
        stroke="#012d1d"
        strokeWidth="2.5"
      />
      {/* Barn / Field Horizon */}
      <path
        d="M6 25C12 21 24 21 30 25V31H6V25Z"
        fill="#006c48"
        stroke="#012d1d"
        strokeWidth="2"
      />
      {/* Furrow Lines */}
      <path
        d="M11 31L16 23M18 31V22M25 31L20 23"
        stroke="#8af6b8"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Rising Sun & Sprout */}
      <circle cx="18" cy="13" r="4.5" fill="#8af6b8" stroke="#012d1d" strokeWidth="2" />
      <path
        d="M18 6V8M11 10L12.5 11.5M25 10L23.5 11.5"
        stroke="#012d1d"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Custom KPI Stamp Emblem SVGs for Dashboard Metric Cards
 */
export function KpiEmblemSvg({
  variant,
  className = 'w-11 h-11',
}: {
  variant: 'land' | 'cycles' | 'harvest' | 'quality';
  className?: string;
}) {
  if (variant === 'land') {
    return (
      <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="40"
          height="40"
          rx="10"
          fill="#8af6b8"
          stroke="#012d1d"
          strokeWidth="2.5"
        />
        <path
          d="M9 14H35V32H9V14Z"
          fill="#f6fbf4"
          stroke="#012d1d"
          strokeWidth="2.2"
        />
        <path
          d="M22 14V32M9 23H35"
          stroke="#006c48"
          strokeWidth="2"
          strokeDasharray="3 2"
        />
        <circle cx="15.5" cy="18.5" r="2" fill="#006c48" />
        <circle cx="28.5" cy="27.5" r="2" fill="#775700" />
      </svg>
    );
  }

  if (variant === 'cycles') {
    return (
      <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="40"
          height="40"
          rx="10"
          fill="#ffdb92"
          stroke="#012d1d"
          strokeWidth="2.5"
        />
        <path
          d="M22 33V17"
          stroke="#012d1d"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M22 20C22 13 29 10 34 12C33 18 28 22 22 20Z"
          fill="#006c48"
          stroke="#012d1d"
          strokeWidth="2.2"
        />
        <path
          d="M22 25C22 19 15 16 10 18C11 24 16 27 22 25Z"
          fill="#8af6b8"
          stroke="#012d1d"
          strokeWidth="2.2"
        />
        <path
          d="M14 33H30"
          stroke="#012d1d"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (variant === 'harvest') {
    return (
      <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="40"
          height="40"
          rx="10"
          fill="#92f7c3"
          stroke="#012d1d"
          strokeWidth="2.5"
        />
        {/* Weighbridge Scale */}
        <path
          d="M12 29H32L29 35H15L12 29Z"
          fill="#012d1d"
        />
        <rect
          x="15"
          y="14"
          width="14"
          height="13"
          rx="3"
          fill="#f6fbf4"
          stroke="#012d1d"
          strokeWidth="2.2"
        />
        <circle cx="22" cy="20.5" r="3.5" fill="#ffdb92" stroke="#012d1d" strokeWidth="1.8" />
        <path d="M22 20.5L24 18.5" stroke="#012d1d" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="40"
        height="40"
        rx="10"
        fill="#e5eee6"
        stroke="#012d1d"
        strokeWidth="2.5"
      />
      {/* Quality Verification Shield & Check */}
      <path
        d="M22 9L33 13.5V21.5C33 28 28.2 33.2 22 35C15.8 33.2 11 28 11 21.5V13.5L22 9Z"
        fill="#006c48"
        stroke="#012d1d"
        strokeWidth="2.2"
      />
      <path
        d="M17.5 22L20.5 25L27 18.5"
        stroke="#ffdb92"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Custom Botanical Crop Emblem SVG (Turmeric, Soybean, Wheat, Tomato, Rice, etc.)
 */
export function CropEmblemSvg({
  cropName,
  className = 'w-10 h-10',
}: {
  cropName: string;
  className?: string;
}) {
  const normalized = cropName.toLowerCase();
  const isTurmeric = normalized.includes('turmeric') || normalized.includes('haldi');
  const isSoybean = normalized.includes('soy') || normalized.includes('pulse');
  const isWheat = normalized.includes('wheat') || normalized.includes('grain');
  const isTomato = normalized.includes('tomato') || normalized.includes('veg');

  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="10"
        fill={isTurmeric ? '#ffdb92' : isSoybean ? '#8af6b8' : isTomato ? '#ffdad6' : '#d8e6df'}
        stroke="#012d1d"
        strokeWidth="2.5"
      />
      {isTurmeric ? (
        <>
          {/* Turmeric Rhizome & Broad Leaf */}
          <path
            d="M24 27V11"
            stroke="#012d1d"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M24 12C17 14 14 20 18 25C22 22 24 17 24 12Z"
            fill="#006c48"
            stroke="#012d1d"
            strokeWidth="2"
          />
          <path
            d="M24 14C31 16 34 21 30 26C26 23 24 18 24 14Z"
            fill="#8af6b8"
            stroke="#012d1d"
            strokeWidth="2"
          />
          {/* Golden Rhizome Root Cluster */}
          <path
            d="M15 31C15 28.5 19 27 24 27C29 27 33 28.5 33 31C33 34 29 36 24 36C19 36 15 34 15 31Z"
            fill="#d99b26"
            stroke="#012d1d"
            strokeWidth="2.2"
          />
          <circle cx="15" cy="33" r="3" fill="#b87a00" stroke="#012d1d" strokeWidth="2" />
          <circle cx="33" cy="33" r="3" fill="#b87a00" stroke="#012d1d" strokeWidth="2" />
        </>
      ) : isSoybean ? (
        <>
          {/* Soybean Pod & Trifoliate Seeds */}
          <path
            d="M14 32C12 24 19 14 31 13C34 21 27 33 14 32Z"
            fill="#006c48"
            stroke="#012d1d"
            strokeWidth="2.4"
          />
          <circle cx="19" cy="26" r="3.2" fill="#ffdb92" stroke="#012d1d" strokeWidth="1.8" />
          <circle cx="24" cy="22" r="3.2" fill="#ffdb92" stroke="#012d1d" strokeWidth="1.8" />
          <circle cx="28.5" cy="17.5" r="2.8" fill="#ffdb92" stroke="#012d1d" strokeWidth="1.8" />
        </>
      ) : isWheat ? (
        <>
          {/* Golden Wheat Stalk */}
          <path d="M24 38V11" stroke="#012d1d" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="20" cy="17" rx="3" ry="4.5" transform="rotate(-25 20 17)" fill="#ffdb92" stroke="#012d1d" strokeWidth="2" />
          <ellipse cx="28" cy="17" rx="3" ry="4.5" transform="rotate(25 28 17)" fill="#ffdb92" stroke="#012d1d" strokeWidth="2" />
          <ellipse cx="20" cy="25" rx="3" ry="4.5" transform="rotate(-25 20 25)" fill="#ffdb92" stroke="#012d1d" strokeWidth="2" />
          <ellipse cx="28" cy="25" rx="3" ry="4.5" transform="rotate(25 28 25)" fill="#ffdb92" stroke="#012d1d" strokeWidth="2" />
        </>
      ) : isTomato ? (
        <>
          <circle cx="24" cy="26" r="10" fill="#ba1a1a" stroke="#012d1d" strokeWidth="2.4" />
          <path d="M19 16L24 19L29 16M24 13V19" stroke="#006c48" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Default Botanical Specimen */}
          <path d="M24 36V14" stroke="#012d1d" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M24 18C17 16 13 21 15 27C20 27 23 23 24 18Z" fill="#006c48" stroke="#012d1d" strokeWidth="2" />
          <path d="M24 22C31 20 35 25 33 31C28 31 25 27 24 22Z" fill="#8af6b8" stroke="#012d1d" strokeWidth="2" />
          <circle cx="24" cy="13" r="3" fill="#ffdb92" stroke="#012d1d" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

/**
 * Illustrated Botanical Specimen Banner for Parcel Cards
 * Replaces fragile external URLs with a crisp, self-contained Neo-Brutalist field diagram.
 */
export function CropSpecimenBanner({
  cropName,
  plotName,
  stageLabel,
  soilPh,
}: {
  cropName: string;
  plotName: string;
  stageLabel: string;
  soilPh: number | null | undefined;
}) {
  const normalized = cropName.toLowerCase();
  const isTurmeric = normalized.includes('turmeric') || normalized.includes('haldi');
  const isSoybean = normalized.includes('soy') || normalized.includes('pulse');

  return (
    <div className="w-full h-32 rounded-lg overflow-hidden relative border-2 border-primary bg-[#e9f5ec] flex items-center justify-between px-4 py-3 select-none">
      {/* Background Topographic & Grid Overlay */}
      <svg
        viewBox="0 0 320 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 32H320M0 64H320M0 96H320M64 0V128M128 0V128M192 0V128M256 0V128"
          stroke="#012d1d"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
        {/* Terraced Soil Contour Horizon */}
        <path
          d="M0 94C65 82 130 88 195 98C245 105 285 95 320 88V128H0V94Z"
          fill={isTurmeric ? '#ffdb92' : isSoybean ? '#92f7c3' : '#d5e7dc'}
          fillOpacity="0.65"
        />
        <path
          d="M0 108C80 100 160 106 240 112C275 115 300 110 320 105V128H0V108Z"
          fill="#006c48"
          fillOpacity="0.22"
        />
        {/* Sun Disc */}
        <circle
          cx="276"
          cy="34"
          r="18"
          fill="#ffdb92"
          stroke="#012d1d"
          strokeWidth="2"
        />
        {/* Decorative Crop Rows */}
        <path
          d="M18 118L72 92M64 118L112 92M110 118L152 94"
          stroke="#012d1d"
          strokeOpacity="0.25"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {/* Left Specimen Emblem + Botanical Label */}
      <div className="relative z-10 flex items-center gap-3 min-w-0 pr-2">
        <CropEmblemSvg cropName={cropName} className="w-13 h-13 shrink-0 shadow-[2px_2px_0px_#012d1d] rounded-xl" />
        <div className="min-w-0">
          <span className="block max-w-[155px] truncate px-2 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px] font-bold uppercase tracking-wider">
            {plotName}
          </span>
          <h4 className="font-headline-sm text-headline-sm text-primary mt-1 leading-tight truncate">
            {cropName}
          </h4>
          <p className="font-label-sm text-label-sm text-secondary font-bold truncate">
            Stage: {stageLabel}
          </p>
        </div>
      </div>

      {/* Right Telemetry Stamp */}
      <div className="relative z-10 shrink-0 bg-surface-container-lowest/95 border-2 border-primary rounded-lg px-2.5 py-1.5 text-right shadow-[2px_2px_0px_#012d1d]">
        <div className="font-mono text-[10px] font-bold text-on-surface-variant uppercase leading-none">
          SOIL pH
        </div>
        <div className="font-mono font-bold text-primary text-sm tabular-nums mt-0.5 leading-none">
          {soilPh !== null && soilPh !== undefined ? soilPh.toFixed(1) : 'N/A'}
        </div>
      </div>
    </div>
  );
}
