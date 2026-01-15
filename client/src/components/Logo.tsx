import elevizionLogo from "@/assets/elevizion-logo.png";

interface LogoProps {
  className?: string;
  alt?: string;
}

export default function Logo({ className = "h-10 w-auto", alt = "Elevizion - See Your Business Grow" }: LogoProps) {
  return (
    <img 
      src={elevizionLogo}
      alt={alt}
      className={className}
      loading="eager"
    />
  );
}
