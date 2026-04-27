import Converter from "@/components/Converter";

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-5 py-12 sm:py-20">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-400 shadow-glow" />
          YouTube → MP3
        </div>
        <h1 className="bg-gradient-to-b from-white to-brand-200 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          Saniyeler içinde MP3
        </h1>
        <p className="max-w-xl text-balance text-sm text-neutral-400 sm:text-base">
          YouTube bağlantısını yapıştır, kalitesini seç, tek tıkla indir.
          Minimalist ve modern.
        </p>
      </header>

      <Converter />

      <footer className="mt-auto text-center text-xs text-neutral-500">
        <p>
          Bu araç yalnızca kendi içeriğiniz veya açıkça izin verilmiş
          materyaller için tasarlanmıştır. Telif hakkıyla korunan içerikleri
          izinsiz indirmek YouTube Hizmet Şartlarına ve yasalara aykırı olabilir.
        </p>
      </footer>
    </main>
  );
}
