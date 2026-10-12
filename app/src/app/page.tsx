import { ButtonLink } from "@/components/ui/Button";
import { Inspiration } from "@/features/home/Inspiration";

const STEPS = [
  { n: 1, img: "/gallery/thumb-house-2.jpg", pos: "center 35%", title: "Configure the entrance of your dreams", text: "Choose layout, door, glass, colors and hardware in a few simple steps, and see it from outside and inside.", cta: { href: "/configurator", label: "START CREATING" } },
  { n: 2, img: "/gallery/thumb-room-1.jpg", pos: "center",
    title: "Save your design", text: "Save your entrance on this device. Explore several styles and take your time to plan the perfect entrance.", cta: { href: "/designs", label: "MY DESIGNS" } },
  { n: 3, img: "/gallery/thumb-house-3.jpg", pos: "center 45%",
    title: "Share your entrance", text: "Your design is taking shape! Send a link to a friend, a contractor or a retailer to get feedback or a quote.", cta: { href: "/configurator?preset=grand-entry", label: "TRY AN EXAMPLE" } },
];

export default function HomePage() {
  return (
    <>
      <section className="grid lg:min-h-[calc(100svh-var(--header-h)-72px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="anim-rise flex flex-col justify-center bg-warm px-6 py-14 sm:px-12 lg:px-20 lg:py-20">
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Create your door</h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/85">
            Transform the facade of your home. Build the door of your dreams in a few simple steps, see it from every angle, and check how it looks on a photo of your own house.
          </p>
          <div className="mt-8">
            <ButtonLink href="/configurator" variant="secondary" size="lg" className="w-full max-w-md justify-start rounded-none border-ink! bg-transparent px-5 tracking-[0.14em] hover:bg-ink hover:text-white sm:w-[26rem]">
              <svg width="26" height="18" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M1 9h23M16 1.5 24 9l-8 7.5" /></svg>
              START CREATING
            </ButtonLink>
          </div>
        </div>
        <div className="relative min-h-[300px] bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element -- static CC0 sample photo, credits in public/gallery/CREDITS.md */}
          <img src="/gallery/house-1.jpg" alt="A white clapboard house with a covered front door" width={1200} height={904} fetchPriority="high" className="absolute inset-0 size-full object-cover" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-black tracking-tight">How it works?</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col overflow-hidden rounded-lg bg-surface shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- static CC0 sample photo */}
              <img src={s.img} alt="" loading="lazy" width={640} height={320} className="h-40 w-full object-cover" style={{ objectPosition: s.pos }} />
              <div className="flex flex-1 flex-col p-6">
              <span className="grid size-10 place-items-center rounded-full bg-brand text-lg font-black text-white">{s.n}</span>
              <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 flex-1 text-muted">{s.text}</p>
              <ButtonLink href={s.cta.href} variant="secondary" className="mt-6 self-start">{s.cta.label}</ButtonLink>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="inspiration" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-20 sm:px-6" aria-labelledby="inspire">
        <h2 id="inspire" className="text-3xl font-black tracking-tight">Get inspired</h2>
        <p className="mt-2 max-w-2xl text-muted">Not sure where to start? Pick a trendy configuration and make it yours.</p>
        <div className="mt-6"><Inspiration /></div>
      </section>
    </>
  );
}
