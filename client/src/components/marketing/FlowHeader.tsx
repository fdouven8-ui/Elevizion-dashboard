import Logo from "@/components/Logo";

export default function FlowHeader() {
  return (
    <header className="bg-white border-b border-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center">
          <Logo className="h-16 md:h-20 w-auto" />
        </div>
      </div>
    </header>
  );
}
