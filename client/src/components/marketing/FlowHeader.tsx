import elevizionLogo from "@/assets/elevizion-logo.png";

export default function FlowHeader() {
  return (
    <header className="bg-white border-b border-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center">
          <img 
            src={elevizionLogo}
            alt="Elevizion - See Your Business Grow" 
            className="h-16 md:h-20 w-auto"
            loading="eager"
          />
        </div>
      </div>
    </header>
  );
}
